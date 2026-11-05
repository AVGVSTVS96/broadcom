import { useState } from "react";
import type { ReactNode } from "react";

import { hatchStyle } from "@/components/viz/hatch";
import { Legend } from "@/components/viz/legend";
import { Dot, Path, Strokes } from "@/components/viz/plot";
import { Section } from "@/components/viz/section";
import { activity, busiest } from "@/lib/model/activity";
import type { Day, Hour } from "@/lib/model/activity";
import { clock, hour as hourOf, weekday } from "@/lib/model/format";
import { HOUR } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import type { Plan } from "@/lib/model/pool";
import { cn } from "@/lib/utils";

import { activityPlans, legendLevels, level, steps } from "./cells";
import { outcome } from "./outcome";

const levelLabel = (index: number) => {
  if (index === 0) {
    return "0";
  }

  const step = steps[index - 1];

  return step === undefined ? `${steps[2]}+` : `≤${step}`;
};

const hourMarks = [0, 6, 12, 18] as const;

const Matrix = ({
  days,
  names,
  peak,
}: {
  days: readonly Day[];
  names: ReadonlyMap<string, string>;
  peak: readonly number[];
}) => {
  const [focus, setFocus] = useState<Hour | null>(null);
  const top = Math.max(...peak, 1);
  const average = peak.map((used) => used / days.length);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_3.5rem] gap-x-2">
        <div className="self-end text-xs text-muted-foreground">Average</div>
        <div className="relative h-12">
          <Strokes>
            <Path
              points={average.map((used, index) => [
                ((index + 0.5) / 24) * 100,
                100 - (used / (top / days.length)) * 90,
              ])}
              className="text-foreground"
            />
          </Strokes>
        </div>
        <div />
        <div />
        <div className="relative h-5 text-xs text-muted-foreground">
          {hourMarks.map((mark) => (
            <span
              key={mark}
              className="absolute"
              style={{ left: `${(mark / 24) * 100}%` }}
            >
              {hourOf(new Date(2026, 0, 1, mark).getTime())}
            </span>
          ))}
        </div>
        <div className="text-right text-xs text-muted-foreground">Locked</div>
        {days.map((day) => (
          <div key={day.from} className="contents">
            <div className="py-0.5 text-xs leading-5 text-muted-foreground">
              {weekday(day.from)} {new Date(day.from).getDate()}
            </div>
            <div className="grid grid-cols-24 gap-0.5 py-0.5">
              {day.hours.map((cell) => (
                <button
                  key={cell.from}
                  type="button"
                  aria-label={`${clock(cell.from)}: ${Math.round(cell.used)} points`}
                  onPointerEnter={() => {
                    setFocus(cell);
                  }}
                  onFocus={() => {
                    setFocus(cell);
                  }}
                  className={cn(
                    "relative grid h-5 place-items-center rounded-[3px] transition-opacity hover:opacity-70",
                    cell.future ? "border border-dashed" : level(cell.used)
                  )}
                >
                  {cell.runOuts.length > 0 ? (
                    <Dot tone="bad" className="size-2 ring-0" />
                  ) : null}
                </button>
              ))}
            </div>
            <div className="py-0.5">
              <div
                className={cn(
                  "h-5 rounded-[3px] text-center text-xs leading-5",
                  day.locked === 0 ? "bg-track" : "font-medium text-foreground"
                )}
                style={day.locked === 0 ? undefined : hatchStyle}
              >
                {day.locked === 0 ? null : day.locked}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="min-h-5 text-sm text-muted-foreground">
        {focus === null ? null : (
          <>
            <span className="text-foreground">{clock(focus.from)}</span> ·{" "}
            {Math.round(focus.used)} points · {focus.free} of {focus.present}{" "}
            plans free
            {focus.runOuts.length > 0
              ? ` · ${focus.runOuts.map((id) => names.get(id) ?? id).join(", ")} ran out`
              : null}
          </>
        )}
      </p>
      <Legend
        items={[
          ...legendLevels.map((fill, index) => ({
            fill,
            key: "box" as const,
            label: levelLabel(index),
          })),
          { key: "dot", label: "Ran out" },
          { key: "hatch", label: "Plans locked" },
        ]}
      />
    </div>
  );
};

const cellsAhead = 28;

const cellSize = 6 * HOUR;

const Forecast = ({ plans, now }: { plans: readonly Plan[]; now: number }) => (
  <div className="space-y-1">
    {plans.map((plan) => {
      const { pace } = plan;

      if (pace === null) {
        return null;
      }

      const lockFrom = pace.locked ? now : pace.runsOut;
      const result = outcome(pace);

      return (
        <div
          key={plan.id}
          className="grid items-center gap-x-4 gap-y-1 border-t py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_11rem]"
        >
          <div className="truncate text-sm">{plan.name}</div>
          <div className="grid grid-cols-28 gap-0.5">
            {Array.from({ length: cellsAhead }, (_, index) => {
              const from = now + index * cellSize;
              const to = from + cellSize;
              const afterReset = from >= pace.resetsAt;
              const locked = lockFrom !== null && to > lockFrom && !afterReset;

              const runsOut =
                pace.runsOut !== null &&
                pace.runsOut >= from &&
                pace.runsOut < to;

              const resets = pace.resetsAt >= from && pace.resetsAt < to;

              return (
                <div
                  key={from}
                  className={cn(
                    "relative grid h-6 place-items-center rounded-[3px]",
                    afterReset && "border border-dashed",
                    !afterReset && !locked && "bg-foreground/30",
                    resets && "border-r-2 border-r-foreground"
                  )}
                  style={locked ? hatchStyle : undefined}
                >
                  {runsOut ? <Dot tone="bad" className="size-2" /> : null}
                </div>
              );
            })}
          </div>
          <div className="text-sm">
            <div className={cn(result.bad && "text-bad")}>{result.text}</div>
            <div className="text-muted-foreground">{result.note}</div>
          </div>
        </div>
      );
    })}
  </div>
);

export const ActivityView = ({
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
  const { byHour, start, end } = busiest(days);

  const runOuts = days
    .flatMap((day) => day.hours)
    .flatMap((cell) => cell.runOuts).length;

  const names = new Map(plans.map((plan) => [plan.id, plan.name]));

  const short = plans.filter(
    (plan) =>
      plan.pace !== null && (plan.pace.locked || plan.pace.runsOut !== null)
  );

  const [firstOut] = short.toSorted(
    (a, b) =>
      (a.pace?.ranOut ?? a.pace?.runsOut ?? 0) -
      (b.pace?.ranOut ?? b.pace?.runsOut ?? 0)
  );

  const ordered = plans.toSorted(
    (a, b) => (a.pace?.resetsAt ?? 0) - (b.pace?.resetsAt ?? 0)
  );

  return (
    <div className="space-y-6">
      <Section
        title={`Busiest ${hourOf(new Date(2026, 0, 1, start).getTime())} to ${hourOf(new Date(2026, 0, 1, end).getTime())}`}
        detail={`${runOuts} ${runOuts === 1 ? "run-out" : "run-outs"} in 7 days, across ${plans.length} plans. Weekly points used per hour.`}
        actions={toggle}
      >
        <Matrix days={days} names={names} peak={byHour} />
      </Section>
      <Section
        title={
          short.length === 0
            ? "Every plan lasts to its reset"
            : `${short.length} of ${plans.length} plans run out before reset`
        }
        detail={
          firstOut === undefined
            ? undefined
            : `${firstOut.name} first, then locked until ${clock(firstOut.pace?.resetsAt ?? 0)}.`
        }
      >
        <Forecast plans={ordered} now={now} />
        <Legend
          className="mt-4"
          items={[
            { fill: "bg-foreground/30", key: "box", label: "Has room" },
            { key: "dot", label: "Runs out" },
            { key: "hatch", label: "Locked until reset" },
            {
              className: "text-muted-foreground",
              key: "hollow",
              label: "After reset",
            },
          ]}
        />
      </Section>
    </div>
  );
};
