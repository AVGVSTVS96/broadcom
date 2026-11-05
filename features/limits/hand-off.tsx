import { Fragment } from "react";
import type { ReactNode } from "react";

import { hatchStyle } from "@/components/viz/hatch";
import { Legend } from "@/components/viz/legend";
import { Section } from "@/components/viz/section";
import { activity, activityPlans, gaps } from "@/lib/model/activity";
import type { Day, Gap, Hour } from "@/lib/model/activity";
import { addHours } from "@/lib/model/calendar";
import { clock, duration, hour, weekday } from "@/lib/model/format";
import type { Points } from "@/lib/model/history";
import type { Plan } from "@/lib/model/pool";
import { cn } from "@/lib/utils";

import { level } from "./cells";

const freeFill = (cell: Hour) => {
  if (cell.future || cell.present === 0) {
    return "border border-dashed";
  }

  if (cell.free === 0) {
    return "bg-bad";
  }

  return cell.free === 1 ? "bg-foreground/40" : "bg-track";
};

const noneFree = (day: Day) =>
  day.hours.filter(
    (cell) => !cell.future && cell.present > 0 && cell.free === 0
  ).length;

const DayRow = ({
  day,
  plans,
  dayGaps,
}: {
  day: Day;
  plans: readonly Plan[];
  dayGaps: readonly Gap[];
}) => {
  const hours = noneFree(day);
  const [longest] = dayGaps.toSorted((a, b) => b.to - b.from - (a.to - a.from));

  return (
    <div className="grid gap-x-4 gap-y-2 border-t py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_10rem]">
      <div className="text-sm">
        {weekday(day.from)} {new Date(day.from).getDate()}
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5">
        {plans.map((plan, index) => (
          <Fragment key={plan.id}>
            <span className="truncate text-[10px] leading-none text-muted-foreground">
              {plan.name}
            </span>
            <div className="grid grid-cols-24 gap-0.5">
              {day.hours.map((cell) => {
                const own = cell.plans[index];

                return (
                  <span
                    key={cell.from}
                    className={cn(
                      "h-2.5 rounded-[2px]",
                      own === undefined || cell.future || !own.present
                        ? "border border-dashed"
                        : level(own.used)
                    )}
                    style={own?.locked && !cell.future ? hatchStyle : undefined}
                  />
                );
              })}
            </div>
          </Fragment>
        ))}
        <span className="pt-0.5 text-[10px] leading-none text-muted-foreground">
          Free
        </span>
        <div className="grid grid-cols-24 gap-0.5 pt-0.5">
          {day.hours.map((cell) => (
            <span
              key={cell.from}
              className={cn("h-2.5 rounded-[2px]", freeFill(cell))}
            />
          ))}
        </div>
      </div>
      <div className="text-sm">
        {hours === 0 ? (
          <div className="text-muted-foreground">Covered</div>
        ) : (
          <>
            <div className="text-bad">{hours} h none free</div>
            {longest === undefined ? null : (
              <div className="text-muted-foreground">
                {hour(Math.max(longest.from, day.from))} →{" "}
                {hour(Math.min(longest.to, addHours(day.from, 24)))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const PerDay = ({ days }: { days: readonly Day[] }) => {
  const counts = days.map(noneFree);
  const top = Math.max(...counts, 1);

  return (
    <div className="space-y-3">
      <div className="text-sm">Hours with no plan free</div>
      <div className="flex h-36 items-end gap-2">
        {days.map((day, index) => {
          const count = counts[index] ?? 0;

          return (
            <div
              key={day.from}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-xs tabular-nums">{count}</span>
              <span
                className={cn(
                  "w-full max-w-6 rounded-t-[4px]",
                  count > 0 ? "bg-bad" : "bg-track"
                )}
                style={{ height: `${Math.max(4, (count / top) * 100)}%` }}
              />
              <span className="text-xs text-muted-foreground">
                {weekday(day.from)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const HandOffView = ({
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
  const days = activity(activityPlans(plans, history), now);
  const found = gaps(days);
  const total = days.reduce((sum, day) => sum + noneFree(day), 0);
  const [longest] = found.toSorted((a, b) => b.to - b.from - (a.to - a.from));

  return (
    <Section
      title={
        total === 0
          ? "A plan had room every hour in 7 days"
          : `No plan had room for ${total} hours in 7 days`
      }
      detail={
        longest === undefined
          ? "Weekly limits only."
          : `Longest stretch ${clock(longest.from)} to ${clock(Math.min(longest.to, now))}, ${duration(Math.min(longest.to, now) - longest.from)}. Weekly limits only.`
      }
      actions={toggle}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          {days.map((day) => (
            <DayRow
              key={day.from}
              day={day}
              plans={plans}
              dayGaps={found.filter(
                (gap) => gap.from < addHours(day.from, 24) && gap.to > day.from
              )}
            />
          ))}
          <Legend
            className="mt-4"
            items={[
              { fill: "bg-foreground/50", key: "box", label: "Used" },
              { key: "hatch", label: "Locked" },
              { fill: "bg-bad", key: "box", label: "None free" },
              {
                className: "text-foreground/40",
                key: "box",
                label: "One free",
              },
            ]}
          />
        </div>
        <aside className="lg:border-l lg:pl-8">
          <PerDay days={days} />
        </aside>
      </div>
    </Section>
  );
};
