"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Section } from "@/components/viz/section";
import { saveSettings } from "@/features/settings/actions";
import { useLive } from "@/lib/live/client";
import { changesOf, groups } from "@/lib/settings/settings";
import type { Field, Values } from "@/lib/settings/settings";
import { dollars, plural, utcDate } from "@/lib/time/format";

interface Facts {
  readonly server: string | null;
  readonly authDir: string | null;
  readonly stateDir: string | null;
  readonly remote: boolean;
  readonly plans: readonly {
    readonly name: string;
    readonly usd: number;
    readonly since: string | null;
  }[];
}

const Row = ({
  label,
  about,
  htmlFor,
  wide = false,
  children,
}: {
  label: ReactNode;
  about?: string | undefined;
  htmlFor?: string;
  wide?: boolean;
  children: ReactNode;
}) => (
  <div className={wide ? "space-y-2 py-4" : "flex items-center justify-between gap-4 py-4"}>
    <div className="min-w-0 space-y-0.5">
      <label htmlFor={htmlFor} className="block">
        {label}
      </label>
      {about === undefined ? null : <p className="text-sm text-muted-foreground">{about}</p>}
    </div>
    {children}
  </div>
);

const Control = ({
  field,
  values,
  onChange,
}: {
  field: Field;
  values: Values;
  onChange: (next: Values) => void;
}) => {
  if (field.kind === "switch") {
    return (
      <Switch
        id={field.key}
        checked={values[field.key]}
        onCheckedChange={(checked) => {
          onChange({ ...values, [field.key]: checked });
        }}
      />
    );
  }

  if (field.kind === "choice") {
    return (
      <Select
        items={field.options}
        value={values[field.key]}
        onValueChange={(value) => {
          if (value !== null) {
            onChange({ ...values, [field.key]: value });
          }
        }}
      >
        <SelectTrigger id={field.key} className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      id={field.key}
      value={values[field.key]}
      className="h-9 font-mono"
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => {
        onChange({ ...values, [field.key]: event.currentTarget.value });
      }}
    />
  );
};

const Fact = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
    <dt>{label}</dt>
    <dd className="min-w-0 font-mono text-sm break-all text-muted-foreground">{value}</dd>
  </div>
);

export const Settings = ({
  values,
  facts,
  raw,
  problem,
}: {
  values: Values | null;
  facts: Facts | null;
  raw: string;
  problem: string | null;
}) => {
  const [draft, setDraft] = useState<Values | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const policy = useLive((live) => live.pool?.policy ?? null);

  if (values === null || facts === null) {
    return (
      <p className="rounded-2xl border border-bad/40 px-4 py-3 text-sm text-bad" role="alert">
        {problem}
      </p>
    );
  }

  const current = draft ?? values;
  const changes = changesOf(values, current);

  const save = () => {
    setNotice(null);
    startTransition(async () => {
      const result = await saveSettings(changes);

      if (!result.ok) {
        setNotice(result.reason);
      } else if (result.value.length > 0) {
        setNotice(
          `${result.value.join(", ")} changed somewhere else. Nothing was saved; reload to see it.`,
        );
      } else {
        setDraft(null);
        setNotice("Saved");
        setTimeout(() => {
          setNotice((shown) => (shown === "Saved" ? null : shown));
        }, 2500);
      }
    });
  };

  return (
    <div className="space-y-6 pb-24">
      {groups.map((group) => (
        <Section key={group.name} title={group.name}>
          <div className="-mt-4 divide-y">
            {group.fields.map((field) => (
              <Row
                key={field.key}
                label={field.label}
                about={field.about}
                htmlFor={field.key}
                wide={field.kind === "text"}
              >
                <Control
                  field={field}
                  values={current}
                  onChange={(next) => {
                    setNotice(null);
                    setDraft(next);
                  }}
                />
              </Row>
            ))}
            {group.name === "Routing" && policy !== null ? (
              <Row label="Cutoffs and sessions per account">
                <Link
                  href="/accounts#routing"
                  className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {policy.sessionCutoff}% · {policy.weeklyCutoff}% · {policy.agentsPerAccount} on
                  Accounts →
                </Link>
              </Row>
            ) : null}
            {group.name === "Usage"
              ? facts.plans.map((plan) => (
                  <Row key={plan.name} label={plan.name}>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {dollars(plan.usd)} a month
                      {plan.since === null ? "" : ` since ${utcDate(Date.parse(plan.since))}`}
                    </span>
                  </Row>
                ))
              : null}
          </div>
        </Section>
      ))}

      <Section title="Server">
        <dl className="-mt-4 divide-y">
          {facts.server === null ? null : <Fact label="Address" value={facts.server} />}
          {facts.authDir === null ? null : <Fact label="Sign-in files" value={facts.authDir} />}
          {facts.stateDir === null ? null : <Fact label="Usage data" value={facts.stateDir} />}
          <Fact label="Management from other machines" value={facts.remote ? "Allowed" : "Off"} />
        </dl>
        <details className="mt-4 rounded-2xl bg-muted">
          <summary className="cursor-pointer px-4 py-3 text-sm">Full config</summary>
          <pre className="max-h-[32rem] overflow-auto px-4 pb-4 font-mono text-xs leading-relaxed">
            {raw}
          </pre>
        </details>
      </Section>

      {changes.length === 0 && notice === null ? null : (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 pl-4 shadow-lg">
          <output className="text-sm">{notice ?? plural(changes.length, "unsaved change")}</output>
          {changes.length === 0 ? null : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setDraft(null);
                }}
              >
                Discard
              </Button>
              <Button disabled={pending} onClick={save}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
