"use client";

import { ArrowUpRightIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Problems } from "@/components/viz/problems";
import { Section } from "@/components/viz/section";
import { CreditLine, PlanLine } from "@/features/accounts/ledger";
import { Policy } from "@/features/accounts/policy";
import { SignIn } from "@/features/accounts/sign-in";
import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import { accountRows, endsSoon, needsYou } from "@/lib/model/accounts";
import type { Credit, Login, Row, State } from "@/lib/model/accounts";
import { dollars, plural, when } from "@/lib/model/format";

const needs: Partial<Record<State["is"], string>> = {
  disabled: "is disabled",
  error: "can't sign in",
  "sign-in": "needs to sign in again",
};

const headline = (logins: readonly Row[]) => {
  const stuck = logins.flatMap((row) => {
    const need = needs[row.state.is];

    return need === undefined ? [] : [`${row.name} ${need}`];
  });

  const [first] = stuck;

  if (first === undefined) {
    return `All ${plural(logins.length, "sign-in")} work`;
  }

  return stuck.length === 1
    ? first
    : `${stuck.length} of ${logins.length} sign-ins need you`;
};

const backFirst = (rows: readonly Row[]) =>
  rows
    .flatMap((row) =>
      row.state.is === "limited" && row.state.until !== null
        ? [{ name: row.name, until: row.state.until }]
        : []
    )
    .toSorted((left, right) => left.until - right.until)[0];

const firstSignOut = (logins: readonly Row[], now: number) => {
  const [first] = logins
    .flatMap((row) => {
      const until = row.account?.signInUntil ?? null;

      return until === null || needsYou(row) || !endsSoon(row, now)
        ? []
        : [{ name: row.name, until }];
    })
    .toSorted((left, right) => left.until - right.until);

  return first === undefined
    ? null
    : `${first.name}'s sign-in ends ${when(first.until, now)}`;
};

const plansTitle = (plans: readonly Row[], now: number) => {
  const first = backFirst(plans);

  if (first !== undefined) {
    return `${first.name} is back first, ${when(first.until, now)}`;
  }

  const open = plans.filter(
    (row) => row.state.is === "next" || row.state.is === "open"
  ).length;

  return open === plans.length
    ? "Every plan has room"
    : `${open} of ${plural(plans.length, "plan")} have room`;
};

const creditTitle = (keys: readonly Row[]) => {
  const left = keys.reduce((sum, row) => sum + (row.credit?.remaining ?? 0), 0);

  return keys.every((row) => row.state.is === "empty")
    ? `Free credit is used up on ${keys.length === 1 ? "its key" : `all ${keys.length} keys`}`
    : `${dollars(left)} of free credit left`;
};

const useRefreshOnNewAccounts = (ids: string) => {
  const router = useRouter();
  const seen = useRef(ids);

  useEffect(() => {
    if (seen.current !== ids) {
      seen.current = ids;
      router.refresh();
    }
  }, [ids, router]);
};

export const Accounts = ({
  logins,
  credits,
  problems,
  at,
}: {
  logins: readonly Login[];
  credits: readonly Credit[];
  problems: readonly string[];
  at: number;
}) => {
  const now = useNow(at);
  const accounts = useLive((live) => live.accounts);
  const pool = useLive((live) => live.pool);

  const rows = accountRows({
    accounts,
    credits,
    logins,
    order: pool?.order ?? [],
  });

  useRefreshOnNewAccounts(Object.keys(accounts).toSorted().join(" "));

  const plans = rows.filter((row) => row.credit === null);
  const keys = rows.filter((row) => row.credit !== null);
  const ending = firstSignOut(plans, now);
  const next = plans.find((row) => row.state.is === "next");

  const name = (id: string | null) =>
    rows.find((row) => row.account?.id === id)?.name ?? "no account";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
          {headline(plans)}
        </h1>
        <p className="text-muted-foreground">
          {next === undefined ? (
            "No plan takes new work"
          ) : (
            <>
              <span className="text-brand">{next.name}</span> takes new work
            </>
          )}
          {ending === null ? null : `. ${ending}`}
        </p>
      </header>

      <Problems problems={problems} />

      <Section
        title={plansTitle(plans, now)}
        actions={
          <div className="flex gap-2">
            <SignIn
              provider="claude"
              trigger={
                <Button variant="outline">
                  <PlusIcon />
                  Claude
                </Button>
              }
            />
            <SignIn
              provider="codex"
              trigger={
                <Button variant="outline">
                  <PlusIcon />
                  ChatGPT
                </Button>
              }
            />
          </div>
        }
      >
        <div className="-mb-4 divide-y border-t">
          {plans.map((row) => (
            <PlanLine key={row.key} row={row} now={now} />
          ))}
        </div>
      </Section>

      {keys.length === 0 ? null : (
        <Section
          title={creditTitle(keys)}
          detail="Monthly API credit the plans include, at no cost. The pool spends it only after the plans."
          actions={
            <a
              href="https://platform.claude.com/settings/billing"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              Console
              <ArrowUpRightIcon />
            </a>
          }
        >
          <div className="-mb-4 divide-y border-t">
            {keys.map((row) => (
              <CreditLine key={row.key} row={row} now={now} />
            ))}
          </div>
        </Section>
      )}

      {pool === null ? null : (
        <div id="routing" className="scroll-mt-6">
          <Policy pool={pool} name={name} />
        </div>
      )}
    </div>
  );
};
