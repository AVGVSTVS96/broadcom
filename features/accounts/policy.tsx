"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/viz/section";
import { previewPolicy, savePolicy } from "@/features/accounts/actions";
import type {
  Pool,
  Policy as PolicyType,
  PolicyResult,
} from "@/lib/proxy/schema";

const fields = [
  { key: "sessionCutoff", label: "Session cutoff", max: 100, unit: "%" },
  { key: "weeklyCutoff", label: "Weekly cutoff", max: 100, unit: "%" },
  {
    key: "agentsPerAccount",
    label: "Sessions per account",
    max: 500,
    unit: "",
  },
] as const;

const same = (left: PolicyType, right: PolicyType) =>
  fields.every((field) => left[field.key] === right[field.key]);

const valid = (policy: PolicyType) =>
  fields.every(
    (field) =>
      Number.isInteger(policy[field.key]) &&
      policy[field.key] >= 1 &&
      policy[field.key] <= field.max
  );

export const Policy = ({
  pool,
  name,
}: {
  pool: Pool;
  name: (id: string | null) => string;
}) => {
  const [draft, setDraft] = useState<PolicyType | null>(null);
  const [preview, setPreview] = useState<PolicyResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const values = draft ?? pool.policy;
  const dirty = draft !== null && !same(draft, pool.policy);
  const previewed = preview !== null && same(preview.pool.policy, values);
  const { policy } = pool;

  const preview_ = () => {
    setNotice(null);
    startTransition(async () => {
      const result = await previewPolicy(values, pool.revision);

      if (result.ok) {
        setPreview(result.value);
      } else {
        setNotice(result.reason);
      }
    });
  };

  const save = () => {
    if (preview === null) {
      return;
    }

    startTransition(async () => {
      const result = await savePolicy(values, preview.pool.revision);

      setPreview(null);

      if (!result.ok) {
        setNotice(result.reason);
      } else if (result.value.conflict) {
        setNotice(
          "The policy changed somewhere else. Check it and preview again."
        );
      } else {
        setDraft(null);
        setNotice("Saved");
      }
    });
  };

  return (
    <Section
      title={`New work skips an account at ${policy.sessionCutoff}% session or ${policy.weeklyCutoff}% weekly`}
      detail={`A fresh account is sized for ${policy.agentsPerAccount} active sessions, fewer as it fills.`}
    >
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          preview_();
        }}
      >
        {fields.map((field) => (
          <label key={field.key} className="space-y-1.5">
            <span className="text-sm">{field.label}</span>
            <span className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={field.max}
                step={1}
                className="h-9 tabular-nums"
                value={Number.isNaN(values[field.key]) ? "" : values[field.key]}
                onChange={(event) => {
                  setPreview(null);
                  setDraft({
                    ...values,
                    [field.key]: event.currentTarget.valueAsNumber,
                  });
                }}
              />
              <span className="text-sm text-muted-foreground">
                {field.unit}
              </span>
            </span>
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Button
            type="submit"
            variant="secondary"
            disabled={!dirty || !valid(values) || pending}
          >
            Preview
          </Button>
          <Button
            type="button"
            disabled={!dirty || !previewed || pending}
            onClick={save}
          >
            Save
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDraft(null);
                setPreview(null);
              }}
            >
              Discard
            </Button>
          ) : null}
          {dirty && !valid(values) ? (
            <span className="text-sm text-bad">
              Cutoffs run 1–100%, sessions 1–500.
            </span>
          ) : null}
          {notice === null ? null : (
            <output className="text-sm text-muted-foreground">{notice}</output>
          )}
        </div>
      </form>
      {previewed ? (
        <p className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm">
          {preview.pool.next === pool.next
            ? `The next session still goes to ${name(pool.next)}.`
            : `The next session would go to ${name(preview.pool.next)} instead of ${name(pool.next)}.`}
        </p>
      ) : null}
    </Section>
  );
};
