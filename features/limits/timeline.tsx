import type { ReactNode } from "react";

import { hatchStyle } from "@/components/viz/hatch";
import { Legend } from "@/components/viz/legend";
import { Band, Dot } from "@/components/viz/plot";
import { Section } from "@/components/viz/section";
import { addDays, startOfDay } from "@/lib/model/calendar";
import { clock, date, percent, weekday } from "@/lib/model/format";
import { lockedSpans } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import type { Plan } from "@/lib/model/pool";
import { windows } from "@/lib/model/timeline";
import { cn } from "@/lib/utils";

const pastDays = 6;

const spanDays = 14;

const tones = {
  bad: "border-bad/50 bg-bad/10",
  ok: "border-ok/40 bg-ok/10",
  over: "border-over/50 bg-over/10",
} as const;

const fills = { bad: "bg-bad", ok: "bg-ok", over: "bg-over" } as const;

const toneOf = (plan: Plan) => {
  if (plan.pace?.locked === true) {
    return "bad";
  }

  return plan.pace !== null && plan.pace.used > plan.pace.even ? "over" : "ok";
};

const Chip = ({ label, value }: { label: string; value: number | null }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
    <span
      className={cn(
        "size-1.5 rounded-full",
        value !== null && value >= 98 ? "bg-bad" : "bg-ok"
      )}
    />
    <span className="text-muted-foreground">{label}</span>
    {value === null ? "–" : percent(value)}
  </span>
);

const Row = ({
  plan,
  points,
  x,
  now,
}: {
  plan: Plan;
  points: Points;
  x: (at: number) => number;
  now: number;
}) => {
  const { account, pace } = plan;

  if (pace === null) {
    return null;
  }

  const { ended, current, next } = windows(pace.resetsAt, points);
  const tone = toneOf(plan);

  const locks = lockedSpans(
    points,
    pace.cutoff,
    pace.locked ? pace.resetsAt : now
  ).filter(([, to]) => to > current.from);

  const ahead =
    pace.runsOut === null ? null : ([pace.runsOut, pace.resetsAt] as const);

  const spent = (account.resetsSpent ?? []).filter((at) => x(at) > 0);

  const bar = "overflow-hidden rounded-lg";

  return (
    <div className="grid gap-2 border-t py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <div className="min-w-0 space-y-1.5">
        <div className="truncate text-sm">
          {plan.name}
          <span className="text-muted-foreground"> · {account.plan}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Session" value={account.fiveHour.used} />
          <Chip label="Weekly" value={account.week.used} />
        </div>
      </div>
      <div className="relative h-10">
        {ended === null ? null : (
          <Band
            x0={x(ended.from)}
            x1={x(ended.to) - 0.3}
            className={cn(
              bar,
              "bg-muted px-2 text-xs leading-10 text-muted-foreground"
            )}
          >
            <span className="block truncate">
              <span className="max-sm:hidden">Ended {date(ended.to)} · </span>
              {percent(ended.used)}
            </span>
          </Band>
        )}
        <Band
          x0={x(current.from)}
          x1={x(current.to)}
          className={cn(bar, "border", tones[tone])}
        >
          {locks.map(([from, to]) => (
            <Band
              key={from}
              x0={((from - current.from) / (current.to - current.from)) * 100}
              x1={
                ((Math.min(to, current.to) - current.from) /
                  (current.to - current.from)) *
                100
              }
              className="top-0 opacity-60"
              style={hatchStyle}
            />
          ))}
          {ahead === null ? null : (
            <Band
              x0={
                ((ahead[0] - current.from) / (current.to - current.from)) * 100
              }
              x1={100}
              className="top-0 opacity-30"
              style={hatchStyle}
            />
          )}
          <span className="relative block truncate px-2 pt-1.5 text-xs">
            {percent(pace.used)}
            <span className="max-sm:hidden">
              {" "}
              used · {clock(pace.resetsAt)}
            </span>
          </span>
          <span className="absolute inset-x-2 bottom-1.5 h-1 overflow-hidden rounded-full bg-foreground/10">
            <span
              className={cn("block h-full rounded-full", fills[tone])}
              style={{ width: `${Math.min(100, pace.used)}%` }}
            />
          </span>
        </Band>
        <Band
          x0={x(next.from) + 0.3}
          x1={x(next.to)}
          className={cn(
            bar,
            "border border-dashed px-2 text-xs leading-10 text-muted-foreground"
          )}
        >
          <span className="block truncate max-sm:hidden">
            Next {date(next.from)}
          </span>
        </Band>
        {locks.map(([from]) =>
          x(from) <= 0 ? null : (
            <span
              key={from}
              className="absolute top-0.5 -translate-x-1/2"
              style={{ left: `${x(from)}%` }}
            >
              <Dot tone="bad" className="size-2" />
            </span>
          )
        )}
        {spent.map((at) => (
          <span
            key={at}
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
            style={{ left: `${x(at)}%` }}
          />
        ))}
      </div>
    </div>
  );
};

export const TimelineView = ({
  plans,
  history,
  now,
  toggle,
}: {
  plans: readonly Plan[];
  history: Readonly<Record<string, Points>>;
  now: number;
  toggle: ReactNode;
}) => {
  const from = addDays(startOfDay(now), -pastDays);
  const to = addDays(from, spanDays);

  const x = (at: number) =>
    Math.min(100, Math.max(0, ((at - from) / (to - from)) * 100));

  const days = Array.from({ length: spanDays }, (_, index) =>
    addDays(from, index)
  );

  const locked = plans.filter((plan) => plan.pace?.locked === true);

  const [first] = locked.toSorted(
    (a, b) => (a.pace?.resetsAt ?? 0) - (b.pace?.resetsAt ?? 0)
  );

  const today = startOfDay(now);

  return (
    <Section
      title={
        first?.pace === null || first?.pace === undefined
          ? "Every plan has room"
          : `${first.name} is back first, ${clock(first.pace.resetsAt)}`
      }
      detail={`${locked.length} of ${plans.length} plans locked · ${date(from)} – ${date(addDays(to, -1))}`}
      actions={toggle}
    >
      <div className="grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
        <div className="text-sm text-muted-foreground max-sm:hidden">Plan</div>
        <div className="relative grid grid-cols-14 pb-2 text-center text-xs">
          {days.map((day) => (
            <div
              key={day}
              className={cn(
                "min-w-0 rounded-md py-1",
                day === today
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground"
              )}
            >
              <div className="max-sm:hidden">{weekday(day)}</div>
              <div className="truncate">
                <span className="max-sm:hidden">{date(day)}</span>
                <span className="sm:hidden">{new Date(day).getDate()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative pt-6">
        {plans.map((plan) => (
          <Row
            key={plan.id}
            plan={plan}
            points={history[plan.id] ?? []}
            x={x}
            now={now}
          />
        ))}
        <div className="pointer-events-none absolute inset-y-0 right-0 left-0 sm:left-[calc(13rem+1rem)]">
          <span
            className="absolute inset-y-0 w-px bg-foreground"
            style={{ left: `${x(now)}%` }}
          />
          <span
            className="absolute top-0 -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-xs text-background"
            style={{ left: `${x(now)}%` }}
          >
            Now
          </span>
        </div>
      </div>
      <Legend
        className="mt-4"
        items={[
          { fill: "bg-ok", key: "box", label: "This window" },
          { fill: "bg-muted", key: "box", label: "Ended" },
          { key: "dot", label: "Ran out" },
          { key: "hatch", label: "Locked" },
          { key: "line", label: "Reset spent" },
        ]}
      />
    </Section>
  );
};
