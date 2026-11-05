import type { ReactNode } from "react";

import { Segments } from "@/components/viz/segments";
import type { Segment } from "@/components/viz/segments";
import { clock, dollars, duration, utcDate } from "@/lib/model/format";
import {
  creditLeft,
  creditTotal,
  emptyCredit,
  hasRoom,
  left,
} from "@/lib/model/pool";
import type { Plan } from "@/lib/model/pool";
import type { Pool } from "@/lib/proxy/schema";
import { cn } from "@/lib/utils";

import { sessionTone, weekTone } from "./tones";

const Column = ({
  label,
  value,
  unit,
  good,
  parts,
  children,
}: {
  label: string;
  value: string;
  unit: string;
  good: boolean;
  parts: readonly Segment[];
  children: ReactNode;
}) => (
  <div className="min-w-0 space-y-3 py-5 sm:px-6 sm:first:pl-0 sm:last:pr-0">
    <div className="text-sm">{label}</div>
    <div className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "text-5xl font-light tracking-tight",
          good ? "text-ok" : "text-bad"
        )}
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
    <Segments parts={parts} />
    <p className="text-sm text-muted-foreground">{children}</p>
  </div>
);

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

export const Pools = ({
  plans,
  pool,
  now,
}: {
  plans: readonly Plan[];
  pool: Pool | null;
  now: number;
}) => {
  const subscriptions = plans.filter((plan) => plan.hasPlan);
  const open = subscriptions.filter((plan) => hasRoom(plan.account));
  const next = plans.find((plan) => plan.id === pool?.next);
  const grants = plans.flatMap((plan) => plan.grants);
  const empty = grants.filter((grant) => grant.remaining < emptyCredit);

  const [firstBack] = subscriptions
    .filter(
      (plan) => !hasRoom(plan.account) && plan.account.week.resetsAt !== null
    )
    .toSorted(
      (a, b) => (a.account.week.resetsAt ?? 0) - (b.account.week.resetsAt ?? 0)
    );

  const working = sum(plans.map((plan) => plan.account.working));

  const sessionResets = open
    .map((plan) => plan.account.fiveHour.resetsAt)
    .filter((at) => at !== null)
    .toSorted((a, b) => a - b);

  const weekParts = subscriptions.map((plan) => ({
    id: plan.id,
    label: plan.name,
    locked: plan.pace?.locked,
    tone: weekTone(plan.pace),
    value: left(plan.account.week.used) ?? 0,
  }));

  const sessionParts = subscriptions.map((plan) => ({
    id: plan.id,
    label: plan.name,
    locked: !hasRoom(plan.account),
    tone: sessionTone(plan.account.fiveHour, now),
    value: hasRoom(plan.account) ? (left(plan.account.fiveHour.used) ?? 0) : 0,
  }));

  return (
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
          <span className="text-muted-foreground">
            {" · "}
            {open.length} of {subscriptions.length} plans{" "}
            {open.length === 1 ? "has" : "have"} room
          </span>
        </h1>
        <p className="text-muted-foreground">
          {working} working {working === 1 ? "session" : "sessions"}
        </p>
      </div>
      <div className="grid border-y max-sm:divide-y sm:grid-cols-3 sm:divide-x">
        <Column
          label="Weekly"
          value={`${Math.round(sum(weekParts.map((part) => part.value)))}%`}
          unit={`of ${subscriptions.length * 100}%`}
          good={open.length > 0}
          parts={weekParts}
        >
          {firstBack === undefined
            ? "Every plan has room"
            : `${firstBack.name} is back first, ${clock(firstBack.account.week.resetsAt ?? 0)}`}
        </Column>
        <Column
          label="Session · 5 hours"
          value={`${Math.round(sum(sessionParts.map((part) => part.value)))}%`}
          unit={`of ${subscriptions.length * 100}%`}
          good={open.length > 0}
          parts={sessionParts}
        >
          {sessionResets[0] === undefined
            ? "No session window open"
            : `Next reset in ${duration(sessionResets[0] - now)}`}
        </Column>
        <Column
          label="API credit"
          value={dollars(creditLeft(grants))}
          unit={`of ${dollars(creditTotal(grants))}`}
          good={empty.length < grants.length}
          parts={grants.map((grant) => ({
            id: grant.credentialId,
            label: plans.find((plan) => plan.id === grant.account)?.name ?? "",
            tone: grant.remaining < emptyCredit ? "bad" : "ok",
            value: (grant.remaining / grant.allowance) * 100,
          }))}
        >
          {empty.length > 0
            ? `${empty.length} of ${grants.length} keys empty · estimate`
            : `Estimate · ends ${utcDate(Math.min(...grants.map((grant) => grant.expiresAt)))}`}
        </Column>
      </div>
    </section>
  );
};
