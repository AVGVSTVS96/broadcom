"use client";

import { useState } from "react";
import type { PointerEvent, ReactNode } from "react";

import { forecastHatchStyle, hatchStyle } from "@/components/viz/hatch";
import { Legend } from "@/components/viz/legend";
import {
  Area,
  At,
  Band,
  Dot,
  Path,
  Plot,
  Strokes,
} from "@/components/viz/plot";
import type { XY } from "@/components/viz/plot";
import { Section } from "@/components/viz/section";
import { duration, percent, times, when } from "@/lib/model/format";
import { valueAt } from "@/lib/model/history";
import { lockedFor, outcome } from "@/lib/model/pace";
import type { Pace } from "@/lib/model/pace";
import { byPace } from "@/lib/model/pool";
import type { Paced, Plan } from "@/lib/model/pool";
import { cn } from "@/lib/utils";

const fraction = (pace: Pace, at: number) =>
  Math.min(
    100,
    Math.max(0, ((at - pace.start) / (pace.resetsAt - pace.start)) * 100)
  );

const lineOf = (pace: Pace, now: number): XY[] => {
  const end = pace.ranOut ?? now;

  const drawn: XY[] = pace.line
    .filter(([at]) => at <= end)
    .map(([at, used]) => [fraction(pace, at), 100 - used]);

  return pace.locked
    ? drawn
    : [...drawn, [fraction(pace, now), 100 - pace.used]];
};

const projectionOf = (pace: Pace, now: number): XY[] | null => {
  if (pace.locked) {
    return null;
  }

  const from: XY = [fraction(pace, now), 100 - pace.used];

  return pace.runsOut === null
    ? [from, [100, 100 - pace.atReset]]
    : [from, [fraction(pace, pace.runsOut), 100 - pace.cutoff]];
};

const verdict = (ranked: readonly Paced[], now: number) => {
  const open = ranked.filter((plan) => !plan.pace.locked);
  const locked = ranked.length - open.length;

  const [runningOut] = open
    .filter((plan) => plan.pace.runsOut !== null)
    .toSorted((a, b) => (a.pace.runsOut ?? 0) - (b.pace.runsOut ?? 0));

  const [lead] = open;
  const ranOut = locked > 0 ? ` ${locked} already ran out.` : "";

  const runsOut = runningOut?.pace.runsOut ?? null;

  if (runningOut !== undefined && runsOut !== null) {
    return {
      detail: `Runs out ${when(runsOut, now)}, ${duration(lockedFor(runningOut.pace))} before reset.${ranOut}`,
      subject: runningOut,
      title: `${runningOut.name} runs at ${times(runningOut.pace.pace ?? 0)} even pace`,
    };
  }

  if (locked > 0) {
    return {
      detail:
        lead === undefined
          ? undefined
          : `${lead.name} is at ${times(lead.pace.pace ?? 0)} even pace, ~${percent(lead.pace.atReset)} at reset.`,
      subject: lead ?? ranked[0],
      title: `${locked} of ${ranked.length} plans ran out this week`,
    };
  }

  return {
    detail:
      lead === undefined
        ? undefined
        : `${lead.name} leads at ${times(lead.pace.pace ?? 0)} even pace, ~${percent(lead.pace.atReset)} at reset.`,
    subject: lead,
    title: `All ${ranked.length} plans last to reset`,
  };
};

const Readout = ({
  label,
  value,
  bad = false,
}: {
  label: string;
  value: ReactNode;
  bad?: boolean;
}) => (
  <div className="space-y-1">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div
      className={cn("text-2xl font-light tracking-tight", bad && "text-bad")}
    >
      {value}
    </div>
  </div>
);

const Outlook = ({ pace, now }: { pace: Pace; now: number }) => {
  if (pace.locked) {
    return (
      <>
        <Readout
          label="Ran out"
          value={pace.ranOut === null ? "–" : when(pace.ranOut, now)}
          bad
        />
        <Readout label="Back" value={when(pace.resetsAt, now)} />
      </>
    );
  }

  if (pace.runsOut === null) {
    return <Readout label="At reset" value={`~${percent(pace.atReset)}`} />;
  }

  return (
    <>
      <Readout label="Runs out" value={when(pace.runsOut, now)} bad />
      <Readout label="Locked before reset" value={duration(lockedFor(pace))} />
    </>
  );
};

const Focus = ({ plan, now }: { plan: Paced; now: number }) => {
  const { pace } = plan;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-lg">{plan.name}</div>
        <div className="text-sm text-muted-foreground">
          {plan.account.plan} · resets {when(pace.resetsAt, now)}
          {pace.restarted ? ` · restarted ${when(pace.start, now)}` : null}
        </div>
      </div>
      {pace.locked ? (
        <div
          className="inline-flex rounded-lg px-3 py-1.5 text-2xl font-light tracking-tight"
          style={hatchStyle}
        >
          <span className="rounded bg-card px-2">Locked</span>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-light tracking-tight">
            {pace.pace === null ? "–" : times(pace.pace)}
          </span>
          <span className="text-muted-foreground">even pace</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {pace.locked ? null : (
          <>
            <Readout label="Used now" value={percent(pace.used)} />
            <Readout label="Even pace by now" value={percent(pace.even)} />
          </>
        )}
        <Outlook pace={pace} now={now} />
      </div>
    </div>
  );
};

const dotTone = (locked: boolean, focused: boolean) => {
  if (locked) {
    return "bad";
  }

  return focused ? "ink" : "faint";
};

const xTicks = [
  { at: 25, label: "¼" },
  { at: 50, label: "½" },
  { at: 75, label: "¾" },
] as const;

const yTicks = [0, 25, 50, 75, 100] as const;

export const PaceSection = ({
  plans,
  now,
}: {
  plans: readonly Plan[];
  now: number;
}) => {
  const ranked = byPace(plans);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const { title, detail, subject } = verdict(ranked, now);
  const focus = ranked.find((plan) => plan.id === focusId) ?? subject;

  if (focus === undefined) {
    return null;
  }

  const ordered = [...ranked.filter((plan) => plan !== focus), focus];
  const lockFrom = focus.pace.ranOut ?? focus.pace.runsOut;

  const track = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();

    setHover(
      Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100))
    );
  };

  return (
    <Section title={title} detail={detail}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div className="mt-8 grid grid-cols-[2.25rem_minmax(0,1fr)] grid-rows-[auto_1.5rem]">
            <div className="relative h-64 text-xs text-muted-foreground sm:h-80 lg:h-96">
              {yTicks.map((tick) => (
                <span
                  key={tick}
                  className="absolute right-2 -translate-y-1/2"
                  style={{ top: `${100 - tick}%` }}
                >
                  {tick}%
                </span>
              ))}
            </div>
            <div
              className="relative h-64 sm:h-80 lg:h-96"
              onPointerMove={track}
              onPointerLeave={() => {
                setHover(null);
              }}
            >
              <Plot label={`${title}. ${detail ?? ""}`} className="size-full">
                <Strokes>
                  <Area
                    points={[
                      [0, 100],
                      [100, 0],
                      [0, 0],
                    ]}
                    className="text-foreground/[0.035]"
                  />
                  {yTicks.map((tick) => (
                    <Path
                      key={tick}
                      points={[
                        [0, 100 - tick],
                        [100, 100 - tick],
                      ]}
                      width={1}
                      className="text-border"
                    />
                  ))}
                  {xTicks.map((tick) => (
                    <Path
                      key={tick.at}
                      points={[
                        [tick.at, 0],
                        [tick.at, 100],
                      ]}
                      width={1}
                      className="text-border"
                    />
                  ))}
                  <Path
                    points={[
                      [100, 0],
                      [100, 100],
                    ]}
                    width={1}
                    className="text-faint"
                  />
                  <Path
                    points={[
                      [0, 100],
                      [100, 0],
                    ]}
                    width={1}
                    className="text-faint"
                  />
                  {ordered.map((plan) => {
                    const projection = projectionOf(plan.pace, now);

                    const tone =
                      plan === focus ? "text-foreground" : "text-faint";

                    return (
                      <g key={plan.id}>
                        <Path
                          points={lineOf(plan.pace, now)}
                          className={tone}
                        />
                        {projection === null ? null : (
                          <Path points={projection} dashed className={tone} />
                        )}
                      </g>
                    );
                  })}
                  {hover === null ? null : (
                    <Path
                      points={[
                        [hover, 0],
                        [hover, 100],
                      ]}
                      width={1}
                      className="text-foreground/40"
                    />
                  )}
                </Strokes>
                <span className="absolute top-2 left-3 text-xs text-muted-foreground">
                  Ahead of even pace
                </span>
                <span className="absolute right-3 bottom-2 text-xs text-muted-foreground">
                  Behind
                </span>
                <span className="absolute top-[14%] right-[6%] text-xs text-muted-foreground">
                  Even pace
                </span>
                {ranked.map((plan) => {
                  const from = plan.pace.ranOut ?? plan.pace.runsOut;

                  return from === null ? null : (
                    <Band
                      key={plan.id}
                      x0={fraction(plan.pace, from)}
                      x1={100}
                      className={cn(
                        "rounded-[2px]",
                        plan !== focus && "opacity-35"
                      )}
                      style={{
                        ...(plan.pace.locked ? hatchStyle : forecastHatchStyle),
                        height: "8px",
                        top: "-10px",
                      }}
                    />
                  );
                })}
                {ordered.map((plan) => {
                  const end = lineOf(plan.pace, now).at(-1);
                  const projected = projectionOf(plan.pace, now)?.at(-1);
                  const isFocus = plan === focus;

                  return (
                    <div key={plan.id}>
                      {projected === undefined ||
                      plan.pace.runsOut !== null ? null : (
                        <At
                          x={projected[0]}
                          y={projected[1]}
                          className="text-faint"
                        >
                          <Dot hollow className="size-2" />
                        </At>
                      )}
                      {end === undefined ? null : (
                        <At
                          x={end[0]}
                          y={end[1]}
                          className={isFocus ? "z-20" : "z-10"}
                        >
                          <button
                            type="button"
                            aria-label={plan.name}
                            className="grid size-6 place-items-center rounded-full"
                            onClick={() => {
                              setFocusId(plan.id);
                            }}
                          >
                            <Dot tone={dotTone(plan.pace.locked, isFocus)} />
                          </button>
                        </At>
                      )}
                      {end === undefined || plan.pace.locked ? null : (
                        <At
                          x={end[0]}
                          y={end[1]}
                          className="translate-x-3 rounded-full border bg-card px-2 py-0.5 text-xs whitespace-nowrap"
                        >
                          {percent(plan.pace.used)} {plan.name}
                        </At>
                      )}
                      {plan.pace.runsOut === null ? null : (
                        <At
                          x={fraction(plan.pace, plan.pace.runsOut)}
                          y={100 - plan.pace.cutoff}
                        >
                          <Dot
                            tone="bad"
                            className={isFocus ? undefined : "opacity-50"}
                          />
                        </At>
                      )}
                    </div>
                  );
                })}
                {lockFrom === null ? null : (
                  <>
                    <span
                      className="absolute -top-8 -translate-x-1/2 text-xs whitespace-nowrap text-bad"
                      style={{
                        left: `${Math.min(80, fraction(focus.pace, lockFrom))}%`,
                      }}
                    >
                      {focus.pace.locked ? "Ran out" : "Runs out"}{" "}
                      {when(lockFrom, now)}
                    </span>
                    <span className="absolute -top-8 right-0 text-xs text-bad max-sm:hidden">
                      Locked {duration(lockedFor(focus.pace))}
                    </span>
                  </>
                )}
                {hover === null ? null : (
                  <div
                    className="pointer-events-none absolute top-6 z-30 min-w-40 rounded-xl border bg-popover px-3 py-2 text-xs shadow-sm"
                    style={
                      hover > 55
                        ? { right: `${100 - hover + 1}%` }
                        : { left: `${hover + 1}%` }
                    }
                  >
                    <div className="mb-1 text-muted-foreground">
                      {percent(hover)} into the window
                    </div>
                    {ranked.map((plan) => {
                      const at =
                        plan.pace.start +
                        (hover / 100) * (plan.pace.resetsAt - plan.pace.start);

                      const used =
                        at > now ? null : valueAt(plan.pace.line, at);

                      return (
                        <div
                          key={plan.id}
                          className="flex justify-between gap-4"
                        >
                          <span className="text-muted-foreground">
                            {plan.name}
                          </span>
                          <span className="font-medium tabular-nums">
                            {used === null ? "–" : percent(used)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Plot>
            </div>
            <div />
            <div className="relative text-xs text-muted-foreground">
              <span className="absolute top-1.5 left-0">
                {focus.pace.restarted ? "Restarted " : ""}
                {when(focus.pace.start, now)}
              </span>
              {xTicks.map((tick) => (
                <span
                  key={tick.at}
                  className={cn(
                    "absolute top-1.5 -translate-x-1/2",
                    tick.at !== 50 && "max-sm:hidden"
                  )}
                  style={{ left: `${tick.at}%` }}
                >
                  {tick.label}
                </span>
              ))}
              <span className="absolute top-1.5 right-0">
                Resets {when(focus.pace.resetsAt, now)}
              </span>
            </div>
          </div>
          <Legend
            items={[
              { key: "line", label: "Used so far" },
              { key: "dash", label: "If the pace holds" },
              { key: "dot", label: "Runs out" },
              { key: "hatch", label: "Locked" },
              { key: "forecast", label: "Locked if the pace holds" },
            ]}
          />
        </div>
        <aside className="space-y-6 lg:border-l lg:pl-8">
          <Focus plan={focus} now={now} />
          <div className="space-y-1 border-t pt-5">
            {ranked.map((plan) => {
              const result = outcome(plan.pace, now);

              return (
                <button
                  key={plan.id}
                  type="button"
                  aria-pressed={plan === focus}
                  onClick={() => {
                    setFocusId(plan.id);
                  }}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    plan === focus && "bg-muted"
                  )}
                >
                  <span className="truncate">{plan.name}</span>
                  <span
                    className={cn(
                      "text-right tabular-nums",
                      result.bad ? "text-bad" : "text-muted-foreground"
                    )}
                  >
                    {result.text}
                  </span>
                  <span className="col-span-2 text-xs text-muted-foreground">
                    {result.note}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </Section>
  );
};
