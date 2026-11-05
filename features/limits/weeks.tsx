import type { ReactNode } from "react";

import { forecastHatchStyle, hatchStyle } from "@/components/viz/hatch";
import { Legend } from "@/components/viz/legend";
import { Dot } from "@/components/viz/plot";
import { Section } from "@/components/viz/section";
import { addDays, startOfDay } from "@/lib/model/calendar";
import { date, times, weekday } from "@/lib/model/format";
import type { Points } from "@/lib/model/history";
import { outcome } from "@/lib/model/pace";
import type { Plan } from "@/lib/model/pool";
import { evenPerDay, outlookOf, weeksOf, withHistory } from "@/lib/model/weeks";
import type { Daily, Mark, Week, WeekDay } from "@/lib/model/weeks";
import { cn } from "@/lib/utils";

const ratioLabel = (week: Week, base: number | null) => {
  if (week.part || base === null || base === 0) {
    return "–";
  }

  const ratio = (week.current ? week.expected : week.total) / base;

  return `${week.current ? "~" : ""}${times(ratio)}`;
};

const lockStyle = (mark: Mark) => {
  if (mark === "real") {
    return hatchStyle;
  }

  return mark === "forecast" ? forecastHatchStyle : undefined;
};

const height = (value: number, top: number) =>
  `${Math.max(3, (value / top) * 100)}%`;

const Bar = ({ day, top }: { day: WeekDay; top: number }) => (
  <span
    title={`${weekday(day.from)} ${date(day.from)}: ${Math.round((day.used ?? 0) + day.forecast)} points`}
    className="flex h-full flex-1 flex-col justify-end"
  >
    {day.forecast > 0 ? (
      <span
        className={cn(
          "rounded-t-[3px] border border-dashed border-muted-foreground/60",
          day.used !== null && day.used > 0 && "border-b-0"
        )}
        style={{ height: height(day.forecast, top) }}
      />
    ) : null}
    {day.used === null || (day.used === 0 && day.forecast > 0) ? null : (
      <span
        className={cn(
          "bg-foreground/40",
          day.forecast > 0 ? "" : "rounded-t-[3px]"
        )}
        style={{ height: height(day.used, top) }}
      />
    )}
  </span>
);

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
        <Bar key={day.from} day={day} top={top} />
      ))}
    </div>
    <div className="flex h-2 gap-0.5">
      {week.days.map((day) => (
        <span
          key={day.from}
          className={cn(
            "relative grid flex-1 place-items-center rounded-[2px]",
            day.lock === null && "bg-track"
          )}
          style={lockStyle(day.lock)}
        >
          {day.out === null ? null : (
            <Dot
              tone="bad"
              hollow={day.out === "forecast"}
              className="absolute size-2 text-bad"
            />
          )}
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
        {null}
      </Section>
    );
  }

  const rows = plans.map((plan) => {
    const points = history[plan.id] ?? [];

    const own = daily.accounts.find((account) => account.id === plan.id) ?? {
      days: [],
      id: plan.id,
    };

    return {
      plan,
      weeks: weeksOf(
        withHistory(own, points, now),
        since,
        now,
        outlookOf(plan.pace, points, plan.account.since, now)
      ),
    };
  });

  const [header] = rows;

  const ranOut = rows.filter(
    ({ weeks }) =>
      weeks.weeks
        .at(-1)
        ?.days.some((day) => day.out === "real" || day.lock === "real") === true
  ).length;

  const baseWeek = header?.weeks.weeks.find(
    (week) => !week.part && !week.current
  );

  const [exact] = plans
    .flatMap((plan) => history[plan.id]?.[0]?.[0] ?? [])
    .toSorted((a, b) => a - b);

  return (
    <Section
      title={`${ranOut} of ${plans.length} plans ran out this week`}
      detail={[
        baseWeek === undefined
          ? null
          : `Against the week of ${date(baseWeek.from)}.`,
        exact === undefined
          ? null
          : `Days before ${date(addDays(startOfDay(exact), 1))} are estimates.`,
      ]
        .filter((part) => part !== null)
        .join(" ")}
      actions={toggle}
    >
      <div className="space-y-1">
        <div className="grid gap-3 pb-1 text-xs text-muted-foreground sm:grid-cols-[9rem_minmax(0,1fr)_10rem]">
          <span className="max-sm:hidden" />
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
          <span className="max-sm:hidden" />
        </div>
        {rows.map(({ plan, weeks }) => {
          const top = Math.max(
            evenPerDay * 2,
            ...weeks.weeks.flatMap((week) =>
              week.days.map((day) => (day.used ?? 0) + day.forecast)
            )
          );

          const result = plan.pace === null ? null : outcome(plan.pace, now);

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
          {
            className: "text-muted-foreground",
            key: "hollow",
            label: "Forecast",
          },
          { key: "dot", label: "Ran out" },
          { key: "hatch", label: "Locked" },
          { key: "forecast", label: "Locked if the pace holds" },
        ]}
      />
    </Section>
  );
};
