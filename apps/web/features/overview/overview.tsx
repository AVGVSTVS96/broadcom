"use client";

import { Problems } from "@/components/viz/problems";
import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import type { Points } from "@/lib/pool/history";
import { plansOf, poolOf, workingOn } from "@/lib/pool/pool";
import type { Grant, TokensView } from "@/lib/proxy/schema";
import { plural } from "@/lib/time/format";
import { tokenStats } from "@/lib/usage/tokens";
import { format } from "@/lib/usage/usage";

import { PaceSection } from "./pace";
import { PlanRows } from "./plans";
import { Pools } from "./pools";
import { TokensSection } from "./tokens";

export const Overview = ({
  history,
  grants,
  tokens,
  problems,
  rendered,
}: {
  history: Readonly<Record<string, Points>>;
  grants: readonly Grant[] | null;
  tokens: TokensView | null;
  problems: readonly string[];
  rendered: number;
}) => {
  const accounts = useLive((live) => live.accounts);
  const pool = useLive((live) => live.pool);
  const sessions = useLive((live) => live.sessions);
  const now = useNow(rendered);
  const plans = plansOf(accounts, grants ?? [], history, now);
  const summary = poolOf(plans);
  const next = plans.find((plan) => plan.id === pool?.next);

  const working = workingOn(sessions);
  const total = [...working.values()].reduce((sum, list) => sum + list.length, 0);
  const stats = tokens === null ? null : tokenStats(tokens, now);

  return (
    <div className="space-y-10">
      <section className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
            {next === undefined ? (
              (pool?.decision ?? "No plan takes new work")
            ) : (
              <>
                New work goes to <span className="text-brand">{next.name}</span>
              </>
            )}
            <span className="block text-muted-foreground lg:inline">
              <span className="max-lg:hidden"> · </span>
              {summary.open.length} of {summary.subscriptions.length} plans{" "}
              {summary.open.length === 1 ? "has" : "have"} room
            </span>
          </h1>
          <p className="text-muted-foreground">
            {plural(total, "session")} working
            {stats === null ? null : (
              <>
                {" · "}
                <span className="text-tokens">{format("tokens", stats.today)}</span> tokens today
              </>
            )}
          </p>
        </div>
        <Problems problems={problems} />
        <Pools summary={summary} creditProblem={grants === null ? "Didn't load" : null} now={now} />
        {stats === null ? null : <TokensSection stats={stats} />}
        <PlanRows plans={plans} working={working} next={pool?.next ?? null} now={now} />
      </section>
      <PaceSection plans={plans} now={now} />
    </div>
  );
};
