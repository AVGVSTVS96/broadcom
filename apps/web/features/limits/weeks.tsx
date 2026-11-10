import { forecastHatchStyle, hatchStyle } from "@/components/viz/hatch";
import { Legend } from "@/components/viz/legend";
import { Dot } from "@/components/viz/plot";
import { Section } from "@/components/viz/section";
import type { Points } from "@/lib/pool/history";
import { outcome } from "@/lib/pool/pace";
import type { Plan } from "@/lib/pool/pool";
import { evenPerDay, outlookOf, weeksOf } from "@/lib/pool/weeks";
import type { Daily, Mark, Week, WeekDay } from "@/lib/pool/weeks";
import { useTime } from "@/lib/time/client";
import { times } from "@/lib/time/format";
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

const height = (value: number, top: number) => `${Math.max(3, (value / top) * 100)}%`;

const Bar = ({ day, top }: { day: WeekDay; top: number }) => {
  const { date, namedDay, weekday } = useTime();
  const named = namedDay(day.from, day.to);

  return (
    <span
      title={`${weekday(named)} ${date(named)}: ${Math.round((day.used ?? 0) + day.forecast)} points`}
      className="flex h-full flex-1 flex-col justify-end"
    >
      {day.forecast > 0 ? (
        <span
          className={cn(
            "rounded-t-[3px] border border-dashed border-muted-foreground/60",
            day.used !== null && day.used > 0 && "border-b-0",
          )}
          style={{ height: height(day.forecast, top) }}
        />
      ) : null}
      {day.used === null || (day.used === 0 && day.forecast > 0) ? null : (
        <span
          className={cn("bg-foreground/40", day.forecast > 0 ? "" : "rounded-t-[3px]")}
          style={{ height: height(day.used, top) }}
        />
      )}
    </span>
  );
};

const Cell = ({ week, base, top }: { week: Week; base: number | null; top: number }) => (
  <div className="min-w-0 space-y-1.5">
    <span
      className={cn(
        "inline-block rounded-md px-1.5 py-0.5 text-xs tabular-nums",
        week.part ? "border text-muted-foreground" : "bg-muted",
        week.current && "border border-dashed bg-transparent",
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
            day.lock === null && "bg-track",
          )}
          style={lockStyle(day.lock)}
        >
          {day.out === null ? null : (
            <Dot tone="bad" hollow={day.out === "forecast"} className="absolute size-2 text-bad" />
          )}
        </span>
      ))}
    </div>
  </div>
);

const weeksAgo = (back: number) => {
  if (back === 0) {
    return "This week";
  }

  return back === 1 ? "Last week" : `${back} weeks ago`;
};

const columns = (count: number) => ({
  gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
});

export const WeeksView = ({
  plans,
  daily,
  history,
  now,
}: {
  plans: readonly Plan[];
  daily: { since: number | null; accounts: readonly Daily[] } | null;
  history: Readonly<Record<string, Points>>;
  now: number;
}) => {
  const time = useTime();
  const since = daily?.since ?? null;

  if (daily === null || since === null) {
    return <Section title="No weekly history yet">{null}</Section>;
  }

  const rows = plans.map((plan) => {
    const points = history[plan.id] ?? [];

    const own = daily.accounts.find((account) => account.id === plan.id) ?? {
      days: [],
      id: plan.id,
    };

    return {
      plan,
      weeks: weeksOf({
        daily: own,
        now,
        outlook: outlookOf(plan.pace, points, plan.account.since, now),
        points,
        since,
      }),
    };
  });

  const count = Math.max(1, ...rows.map(({ weeks }) => weeks.weeks.length));

  const aligned = (weeks: readonly Week[]) => [
    ...Array.from({ length: count - weeks.length }, () => null),
    ...weeks,
  ];

  const ranOut = rows.filter(
    ({ weeks }) =>
      weeks.weeks.at(-1)?.days.some((day) => day.out === "real" || day.lock === "real") === true,
  ).length;

  const [exact] = plans
    .flatMap((plan) => history[plan.id]?.[0]?.[0] ?? [])
    .toSorted((a, b) => a - b);

  return (
    <Section
      title={`${ranOut} of ${plans.length} plans ran out this week`}
      detail={[
        rows.some(({ weeks }) => weeks.base !== null)
          ? "Against each plan's first full week."
          : null,
        exact === undefined
          ? null
          : `Days before ${time.date(time.addDays(time.startOfDay(exact), 1))} are estimates.`,
      ]
        .filter((part) => part !== null)
        .join(" ")}
    >
      <div className="space-y-1">
        <div className="grid gap-3 pb-1 text-xs text-muted-foreground md:grid-cols-[9rem_minmax(0,1fr)_10rem]">
          <span className="max-md:hidden" />
          <div className="grid gap-3" style={columns(count)}>
            {Array.from({ length: count }, (_, index) => (
              <span key={index} className="min-w-0 truncate">
                {weeksAgo(count - 1 - index)}
              </span>
            ))}
          </div>
          <span className="max-md:hidden" />
        </div>
        {rows.map(({ plan, weeks }) => {
          const top = Math.max(
            evenPerDay * 2,
            ...weeks.weeks.flatMap((week) =>
              week.days.map((day) => (day.used ?? 0) + day.forecast),
            ),
          );

          const result = plan.pace === null ? null : outcome(plan.pace, now, time);

          return (
            <div
              key={plan.id}
              className="grid items-center gap-3 border-t py-3 md:grid-cols-[9rem_minmax(0,1fr)_10rem]"
            >
              <div className="truncate text-sm">{plan.name}</div>
              <div className="grid gap-3" style={columns(count)}>
                {aligned(weeks.weeks).map((week, index) =>
                  week === null ? (
                    <span key={index} />
                  ) : (
                    <Cell key={week.from} week={week} base={weeks.base} top={top} />
                  ),
                )}
              </div>
              <div className="text-sm">
                {result === null ? null : (
                  <div className={cn(result.bad && "text-bad")}>{result.text}</div>
                )}
                <div className="text-muted-foreground">
                  ~{Math.round(weeks.weeks.at(-1)?.expected ?? 0)} points this week
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
