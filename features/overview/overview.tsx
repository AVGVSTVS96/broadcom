"use client";

import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import type { Points } from "@/lib/model/history";
import type { Grant } from "@/lib/proxy/schema";

import { AccountCard } from "./account-card";
import { PaceSection } from "./pace";
import { plansOf } from "./plans";
import { Pools } from "./pools";

export const Overview = ({
  history,
  grants,
  rendered,
}: {
  history: Readonly<Record<string, Points>>;
  grants: readonly Grant[];
  rendered: number;
}) => {
  const accounts = useLive((live) => live.accounts);
  const pool = useLive((live) => live.pool);
  const now = useNow(rendered);
  const plans = plansOf(accounts, grants, history, now);

  return (
    <div className="space-y-10">
      <Pools plans={plans} pool={pool} now={now} />
      <section className="space-y-3">
        {plans.map((plan) => (
          <AccountCard key={plan.id} plan={plan} now={now} />
        ))}
      </section>
      <PaceSection plans={plans} now={now} />
    </div>
  );
};
