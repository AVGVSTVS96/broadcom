"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Problems } from "@/components/viz/problems";
import { AccountCard } from "@/features/accounts/account-card";
import { Policy } from "@/features/accounts/policy";
import { SignIn } from "@/features/accounts/sign-in";
import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import { accountRows, kinds } from "@/lib/model/accounts";
import type { Credit, Kind, Login, Row } from "@/lib/model/accounts";
import type { Points } from "@/lib/model/history";

const groups = {
  api: "Claude API keys",
  chatgpt: "ChatGPT",
  other: "Other",
  plan: "Claude plans",
} as const satisfies Record<Kind, string>;

const needs = {
  disabled: "is off",
  error: "can't sign in",
  "sign-in": "needs to sign in again",
} as const;

const headline = (rows: readonly Row[]) => {
  const stuck = rows.flatMap((row) =>
    row.state.is === "disabled" ||
    row.state.is === "error" ||
    row.state.is === "sign-in"
      ? [{ name: row.name, need: needs[row.state.is] }]
      : []
  );

  const [first] = stuck;

  if (first === undefined) {
    return `All ${rows.length} accounts signed in`;
  }

  return stuck.length === 1
    ? `${first.name} ${first.need}`
    : `${stuck.length} of ${rows.length} accounts need you`;
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
  history,
  problems,
  at,
}: {
  logins: readonly Login[];
  credits: readonly Credit[];
  history: Readonly<Record<string, Points>>;
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

  const name = (id: string | null) =>
    rows.find((row) => row.account?.id === id)?.name ?? "no account";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-medium tracking-tight text-balance">
            {headline(rows)}
          </h1>
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

      {kinds.map((kind) => {
        const members = rows.filter((row) => row.kind === kind);

        return members.length === 0 ? null : (
          <section key={kind} className="space-y-3">
            <h2 className="flex items-baseline gap-2 px-1 font-medium">
              {groups[kind]}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                {members.length}
              </span>
            </h2>
            {members.map((row) => (
              <AccountCard
                key={row.key}
                row={row}
                points={history[row.account?.id ?? ""] ?? []}
                now={now}
              />
            ))}
          </section>
        );
      })}

      {pool === null ? null : (
        <div id="routing" className="scroll-mt-6">
          <Policy pool={pool} name={name} />
        </div>
      )}
    </div>
  );
};
