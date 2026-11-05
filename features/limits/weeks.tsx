import type { ReactNode } from "react";

import { hatchStyle } from "@/components/viz/hatch";
import { Legend } from "@/components/viz/legend";
import { Dot } from "@/components/viz/plot";
import { Section } from "@/components/viz/section";
import { date, weekday } from "@/lib/model/format";
import { lockedSpans } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import type { Plan } from "@/lib/model/pool";
import { evenPerDay, weeksOf, withHistory } from "@/lib/model/weeks";
import type { Daily, Week } from "@/lib/model/weeks";
import { cn } from "@/lib/utils";

import { outcome } from "./outcome";

const ratioLabel = (week: Week, base: number | null) => {
  if (week.part) {
    return "Part";
  }

  if (base === null || base === 0) {
    return "–";
  }

  const ratio = (week.current ? week.expected : week.total) / base;

  return `${week.current ? "~" : ""}${ratio.toFixed(2)}×`;
};

const Cell = ({
  week,
  base,
  top,
}: {
  week: Week;
  base: number | null;
  top: number;
}) => (
  <div className="min-w-0 space-y-1.5">
    <span
      className={cn(
        "inline-block rounded-md px-1.5 py-0.5 text-xs tabular-nums",
        week.part ? "border text-muted-foreground" : "bg-muted",
        week.current && "border border-dashed bg-transparent"
      )}
    >
      {ratioLabel(week, base)}
    </span>
    <div className="relative flex h-14 items-end gap-0.5">
      <span
        className="absolute inset-x-0 border-t border-dashed border-muted-foreground/60"
        style={{ bottom: `${(evenPerDay / top) * 100}%` }}
      />
      {week.days.map((day) => (
        <span
          key={day.from}
          title={`${weekday(day.from)} ${date(day.from)}: ${Math.round(day.used ?? day.forecast)} points`}
          className={cn(
            "relative flex-1 rounded-t-[3px]",
            day.used === null
              ? "border border-b-0 border-dashed border-muted-foreground/60"
              : "bg-foreground/40",
            day.used === null && day.forecast === 0 && "border-0"
          )}
          style={{
            height: `${Math.max(day.used === null && day.forecast === 0 ? 0 : 3, ((day.used ?? day.forecast) / top) * 100)}%`,
          }}
        />
      ))}
    </div>
    <div className="flex h-2 gap-0.5">
      {week.days.map((day) => (
        <span
          key={day.from}
          className={cn(
            "relative grid flex-1 place-items-center rounded-[2px]",
            !day.locked && "bg-track"
          )}
          style={day.locked ? hatchStyle : undefined}
        >
          {day.ranOut ? <Dot tone="bad" className="absolute size-2" /> : null}
        </span>
      ))}
    </div>
  </div>
);

const weekNote = (week: Week, base: Week | undefined, since: number) => {
  if (week.part) {
    return `from ${weekday(since)}`;
  }

  if (week === base) {
    return "Base";
  }

  return week.current ? "Forecast" : "\u00A0";
};

const columns = (count: number) => ({
  gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
});

export const WeeksView = ({
  plans,
  daily,
  history,
  now,
  toggle,
}: {
  plans: readonly Plan[];
  daily: { since: number | null; accounts: readonly Daily[] } | null;
  history: Readonly<Record<string, Points>>;
  now: number;
  toggle: ReactNode;
}) => {
  const since = daily?.since ?? null;

  if (daily === null || since === null) {
    return (
      <Section title="No weekly history yet" actions={toggle}>
        <p className="text-sm text-muted-foreground">
          The proxy has no limit readings to compare weeks with.
        </p>
      </Section>
    );
  }

  const rows = plans.map((plan) => {
    const { pace } = plan;
    const points = history[plan.id] ?? [];

    const own = daily.accounts.find((account) => account.id === plan.id) ?? {
      days: [],
      id: plan.id,
    };

    return {
      plan,
      weeks: weeksOf(withHistory(own, points, now), since, now, {
        left:
          pace === null || pace.locked
            ? 0
            : Math.max(0, pace.cutoff - pace.used),
        locks:
          pace === null
            ? []
            : lockedSpans(
                points,
                pace.cutoff,
                pace.locked ? pace.resetsAt : now
              ),
        perDay: (pace?.pace ?? 0) * evenPerDay,
      }),
    };
  });

  const [header] = rows;

  const ranOut = rows.filter(
    ({ weeks }) =>
      weeks.weeks.at(-1)?.days.some((day) => day.ranOut || day.locked) === true
  ).length;

  const baseWeek = header?.weeks.weeks.find(
    (week) => !week.part && !week.current
  );

  return (
    <Section
      title={`${ranOut} of ${plans.length} plans ran out this week`}
      detail={`Weekly limit points per day, Monday to Sunday, against the week of ${baseWeek === undefined ? "–" : date(baseWeek.from)}. Readings start ${date(since)}; days before the last week are estimates from requests.`}
      actions={toggle}
    >
      <div className="space-y-1">
        <div className="grid gap-3 pb-1 text-xs text-muted-foreground sm:grid-cols-[9rem_minmax(0,1fr)_10rem]">
          <span className="max-sm:hidden">Plan</span>
          <div
            className="grid gap-3"
            style={columns(header?.weeks.weeks.length ?? 1)}
          >
            {header?.weeks.weeks.map((week) => (
              <span key={week.from} className="min-w-0 truncate">
                {week.current ? "This week" : date(week.from)}
                <span className="block">{weekNote(week, baseWeek, since)}</span>
              </span>
            ))}
          </div>
          <span className="max-sm:hidden">This window</span>
        </div>
        {rows.map(({ plan, weeks }) => {
          const top = Math.max(
            evenPerDay * 2,
            ...weeks.weeks.flatMap((week) =>
              week.days.map((day) => day.used ?? day.forecast)
            )
          );

          const result = plan.pace === null ? null : outcome(plan.pace);

          return (
            <div
              key={plan.id}
              className="grid items-center gap-3 border-t py-3 sm:grid-cols-[9rem_minmax(0,1fr)_10rem]"
            >
              <div className="truncate text-sm">{plan.name}</div>
              <div className="grid gap-3" style={columns(weeks.weeks.length)}>
                {weeks.weeks.map((week) => (
                  <Cell
                    key={week.from}
                    week={week}
                    base={weeks.base}
                    top={top}
                  />
                ))}
              </div>
              <div className="text-sm">
                {result === null ? null : (
                  <div className={cn(result.bad && "text-bad")}>
                    {result.text}
                  </div>
                )}
                <div className="text-muted-foreground">
                  ~{Math.round(weeks.weeks.at(-1)?.expected ?? 0)} points this
                  week
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Legend
        className="mt-4"
        items={[
          {
            fill: "bg-foreground/40",
            key: "box",
            label: "Points per day",
          },
          {
            className: "text-muted-foreground",
            key: "dash",
            label: `Even pace, ${evenPerDay.toFixed(1)} a day`,
          },
          { key: "dot", label: "Ran out" },
          { key: "hatch", label: "Locked" },
        ]}
      />
    </Section>
  );
};
