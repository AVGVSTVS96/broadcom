"use client";

import { Problems } from "@/components/viz/problems";
import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import { plural } from "@/lib/model/format";
import type { Points } from "@/lib/model/history";
import { plansOf, poolOf } from "@/lib/model/pool";
import type { Grant } from "@/lib/proxy/schema";

import { PaceSection } from "./pace";
import { PlanRows } from "./plans";
import { Pools } from "./pools";

export const Overview = ({
  history,
  grants,
  problems,
  rendered,
}: {
  history: Readonly<Record<string, Points>>;
  grants: readonly Grant[] | null;
  problems: readonly string[];
  rendered: number;
}) => {
  const accounts = useLive((live) => live.accounts);
  const pool = useLive((live) => live.pool);
  const now = useNow(rendered);
  const plans = plansOf(accounts, grants ?? [], history, now);
  const summary = poolOf(plans);
  const next = plans.find((plan) => plan.id === pool?.next);

  const active = Object.values(accounts).reduce((sum, account) => sum + account.working, 0);

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
            <span className="block text-muted-foreground sm:inline">
              <span className="max-sm:hidden"> · </span>
              {summary.open.length} of {summary.subscriptions.length} plans{" "}
              {summary.open.length === 1 ? "has" : "have"} room
            </span>
          </h1>
          <p className="text-muted-foreground">
            {plural(active, "session")} active in the last 2 min
          </p>
        </div>
        <Problems problems={problems} />
        <Pools summary={summary} creditProblem={grants === null ? "Didn't load" : null} now={now} />
        <PlanRows plans={plans} next={pool?.next ?? null} now={now} />
      </section>
      <PaceSection plans={plans} now={now} />
    </div>
  );
};
