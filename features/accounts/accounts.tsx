"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { AccountCard } from "@/features/accounts/account-card";
import { Ledger } from "@/features/accounts/ledger";
import { Policy } from "@/features/accounts/policy";
import { SignIn } from "@/features/accounts/sign-in";
import { useNow } from "@/features/accounts/use-now";
import { useLive } from "@/lib/live/client";
import { accountRows, kinds } from "@/lib/model/accounts";
import type { Credit, Kind, Login } from "@/lib/model/accounts";

const groups = {
  api: "Claude API keys",
  chatgpt: "ChatGPT",
  other: "Other",
  plan: "Claude plans",
} as const satisfies Record<Kind, string>;

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

  const name = (id: string | null) =>
    rows.find((row) => row.account?.id === id)?.name ?? "no account";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-medium tracking-tight">Accounts</h1>
          {pool === null ? null : (
            <p className="text-muted-foreground">{pool.decision}</p>
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

      {problems.map((problem) => (
        <p
          key={problem}
          className="rounded-2xl border border-bad/40 px-4 py-3 text-sm text-bad"
          role="alert"
        >
          {problem}
        </p>
      ))}

      <Ledger rows={rows} now={now} />

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
              <AccountCard key={row.key} row={row} now={now} />
            ))}
          </section>
        );
      })}

      {pool === null ? null : <Policy pool={pool} name={name} />}
    </div>
  );
};
