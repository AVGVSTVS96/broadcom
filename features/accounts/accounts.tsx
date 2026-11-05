"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Problems } from "@/components/viz/problems";
import { LedgerEntry } from "@/features/accounts/ledger";
import { Policy } from "@/features/accounts/policy";
import { SignIn } from "@/features/accounts/sign-in";
import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import { accountRows, ledgerOf, needsYou } from "@/lib/model/accounts";
import type { Credit, Entry, Login, Row, State } from "@/lib/model/accounts";
import { plural, when } from "@/lib/model/format";
import { DAY } from "@/lib/model/history";

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
    return `All ${plural(logins.length, "login")} signed in`;
  }

  return stuck.length === 1
    ? first
    : `${stuck.length} of ${logins.length} logins need you`;
};

const firstSignOut = (logins: readonly Row[], now: number) => {
  const [first] = logins
    .flatMap((row) => {
      const until = row.account?.signInUntil ?? null;

      return until === null || needsYou(row) || until - now > 7 * DAY
        ? []
        : [{ name: row.name, until }];
    })
    .toSorted((left, right) => left.until - right.until);

  return first === undefined
    ? null
    : `${first.name}'s sign-in ends ${when(first.until, now)}`;
};

const providerOf = (entry: Entry) => {
  if (entry.row.provider === "claude") {
    return "Claude";
  }

  return entry.row.provider === "codex" ? "ChatGPT" : "Other";
};

const countOf = (entries: readonly Entry[]) => {
  const logins = entries.filter((entry) => entry.row.credit === null).length;

  const keys = entries.reduce(
    (sum, entry) => sum + entry.keys.length + Number(entry.row.credit !== null),
    0
  );

  return [
    logins === 0 ? null : plural(logins, "login"),
    keys === 0 ? null : plural(keys, "API key"),
  ]
    .filter((part) => part !== null)
    .join(" · ");
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

  const entries = ledgerOf(rows);
  const signIns = rows.filter((row) => row.credit === null);
  const ending = firstSignOut(signIns, now);

  const name = (id: string | null) =>
    rows.find((row) => row.account?.id === id)?.name ?? "no account";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-medium tracking-tight text-balance">
            {headline(signIns)}
          </h1>
          {ending === null ? null : (
            <p className="text-muted-foreground">{ending}</p>
          )}
        </div>
        <div className="flex gap-2">
          <SignIn
            provider="claude"
            trigger={
              <Button size="lg">
                <PlusIcon />
                Add Claude
              </Button>
            }
          />
          <SignIn
            provider="codex"
            trigger={
              <Button size="lg" variant="outline">
                <PlusIcon />
                Add ChatGPT
              </Button>
            }
          />
        </div>
      </header>

      <Problems problems={problems} />

      <div className="overflow-hidden rounded-3xl border bg-card">
        {[...Map.groupBy(entries, providerOf)].map(([provider, members]) => (
          <section key={provider} className="border-b last:border-b-0">
            <h2 className="flex items-baseline gap-2 border-b bg-muted/40 px-5 py-2.5 text-sm sm:px-6">
              <span className="font-medium">{provider}</span>
              <span className="text-muted-foreground">{countOf(members)}</span>
            </h2>
            <div className="divide-y">
              {members.map((entry) => (
                <LedgerEntry key={entry.row.key} entry={entry} now={now} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {pool === null ? null : (
        <div id="routing" className="scroll-mt-6">
          <Policy pool={pool} name={name} />
        </div>
      )}
    </div>
  );
};
