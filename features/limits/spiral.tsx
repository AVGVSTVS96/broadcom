import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { forecastHatchStyle, hatchStyle } from "@/components/viz/hatch";
import { Legend } from "@/components/viz/legend";
import { At, Band, Dot, Path, Strokes } from "@/components/viz/plot";
import { Section } from "@/components/viz/section";
import { Stat } from "@/components/viz/stat";
import { useLive } from "@/lib/live/client";
import { clock, date, duration, weekday, when } from "@/lib/model/format";
import { HOUR } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import type { Pace } from "@/lib/model/pace";
import type { Plan } from "@/lib/model/pool";
import {
  lockedHours,
  locksFrom,
  locksIn,
  shiftOf,
  spiralOf,
  usualPerWeek,
} from "@/lib/model/spiral";
import type { Span, Spiral, Turn } from "@/lib/model/spiral";
import { evenPerDay } from "@/lib/model/weeks";
import type { Daily, WeekDay } from "@/lib/model/weeks";
import { cn } from "@/lib/utils";

import { legendLevels, planSteps } from "./cells";
import { Coil } from "./coil";
import type { Focus } from "./coil";

const span = (ms: number) => {
  const hours = Math.round(ms / HOUR);
  const days = Math.floor(hours / 24);

  if (hours === 0) {
    return duration(ms);
  }

  return days === 0 ? `${hours} h` : `${days} d ${hours % 24} h`;
};

const shiftText = (earlier: number) =>
  `${span(Math.abs(earlier))} ${earlier >= 0 ? "earlier" : "later"}`;

const titleOf = (plan: Plan, now: number) => {
  const { pace, name } = plan;

  if (pace === null) {
    return `${name} has no weekly reading`;
  }

  if (pace.locked) {
    const from = pace.ranOut === null ? "" : ` from ${when(pace.ranOut, now)}`;

    return `${name} is locked${from} until ${when(pace.resetsAt, now)}`;
  }

  return pace.runsOut === null
    ? `${name} lasts to its reset, ${when(pace.resetsAt, now)}`
    : `${name} runs out ${when(pace.runsOut, now)} if the pace holds`;
};

const toMinute = (at: number) => Math.round(at / 60_000) * 60_000;

const timeOnly = (at: number) => clock(toMinute(at)).replace(/^\S+ /u, "");

const shownRunOuts = 4;

const runOutsText = (spiral: Spiral) => {
  const outs = spiral.turns.flatMap((turn) =>
    turn.runOuts.map((at) =>
      turn.current ? clock(toMinute(at)) : `${date(at)} ${timeOnly(at)}`
    )
  );

  if (outs.length === 0) {
    const thisWeek = spiral.turns.at(-1)?.from ?? 0;

    return spiral.exactFrom === null || spiral.exactFrom >= thisWeek
      ? null
      : `No run-out since ${date(spiral.exactFrom)}.`;
  }

  return `Ran out ${outs.slice(-shownRunOuts).join(", ")}.`;
};

const detailOf = (spiral: Spiral, plan: Plan, now: number) => {
  const { pace } = plan;

  const after =
    pace === null || pace.locked || pace.runsOut === null
      ? null
      : `Then locked until ${when(pace.resetsAt, now)}.`;

  const estimated = spiral.turns.some((turn) =>
    turn.cells.some((cell) => cell.to - cell.from > HOUR)
  );

  const estimates =
    estimated && spiral.exactFrom !== null
      ? `Before ${date(spiral.exactFrom)}, daily estimates.`
      : null;

  return [after, runOutsText(spiral), estimates]
    .filter((part) => part !== null)
    .join(" ");
};

const lockedTime = (spans: readonly Span[]) =>
  spans.reduce((sum, [from, to]) => sum + (to - from), 0);

const Center = ({
  spiral,
  selected,
  now,
}: {
  spiral: Spiral;
  selected: number;
  now: number;
}) => {
  const turn = spiral.turns[selected];

  if (turn === undefined) {
    return null;
  }

  const shift = shiftOf(spiral.turns, selected);
  const locks = locksFrom(spiral, turn);
  const locked = lockedTime(locks);
  const end = locks.at(-1)?.[1];

  const lockCaption = () => {
    if (end === undefined) {
      return turn.current
        ? "locked this week"
        : `locked, week of ${date(turn.from)}`;
    }

    return turn.ranOut === null
      ? "locked if the pace holds"
      : `locked until ${when(end, now)}`;
  };

  const [value, caption] =
    shift === null
      ? [locked === 0 ? "0 h" : span(locked), lockCaption()]
      : [
          span(Math.abs(shift.earlier)),
          `${shift.earlier >= 0 ? "earlier" : "later"} run-out than ${date(shift.than)}`,
        ];

  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="max-w-[40%] text-center">
        <div className="text-base font-normal tracking-tight tabular-nums sm:text-2xl">
          {value}
        </div>
        <div className="text-[11px] leading-tight text-muted-foreground sm:text-xs">
          {caption}
        </div>
      </div>
    </div>
  );
};

const readout = (focus: Focus | null, spiral: Spiral) => {
  const turn = focus === null ? undefined : spiral.turns[focus.turn];
  const cell = focus?.cell ?? null;

  if (turn === undefined) {
    return "Tap a ring for its week";
  }

  if (cell === null) {
    return `Week of ${date(turn.from)}`;
  }

  if (cell.used === null) {
    return `${clock(cell.from)} · no reading`;
  }

  return cell.to - cell.from > HOUR
    ? `${weekday(cell.from)} ${date(cell.from)} · ${cell.used.toFixed(1)} points, estimated`
    : `${clock(cell.from)} · ${cell.used.toFixed(1)} points`;
};

const Scale = () => (
  <span className="flex items-center gap-2 text-xs text-muted-foreground">
    <span aria-hidden className="flex gap-0.5">
      {legendLevels.map((fill) => (
        <span key={fill} className={cn("size-2.5 rounded-[3px]", fill)} />
      ))}
    </span>
    Points an hour, 0 to {planSteps.at(-1)}+
  </span>
);

const x = (turn: Turn, at: number) =>
  ((at - turn.from) / (turn.to - turn.from)) * 100;

const y = (used: number) => 100 - used;

const forecastOf = (turn: Turn, pace: Pace | null, now: number) => {
  if (!turn.current || pace === null || pace.locked) {
    return null;
  }

  const end: readonly [number, number] =
    pace.runsOut === null
      ? [Math.min(pace.resetsAt, turn.to), pace.atReset]
      : [pace.runsOut, pace.cutoff];

  return [[now, pace.used], end] as const;
};

const Curve = ({
  turn,
  pace,
  ahead,
  now,
}: {
  turn: Turn;
  pace: Pace | null;
  ahead: Span | null;
  now: number;
}) => {
  const line: Points = turn.line;
  const cutoff = pace?.cutoff ?? 100;
  const forecast = line.length === 0 ? null : forecastOf(turn, pace, now);
  const runsOut = forecast !== null && pace !== null && pace.runsOut !== null;

  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
      <div className="relative h-40 text-right text-xs text-muted-foreground tabular-nums">
        {[100, 50, 0].map((level) => (
          <span
            key={level}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${y(level)}%` }}
          >
            {level}%
          </span>
        ))}
      </div>
      <div className="relative h-40">
        {[1, 3, 5].map((day) => (
          <Band
            key={day}
            x0={(day / 7) * 100}
            x1={((day + 1) / 7) * 100}
            className="bg-foreground/[0.035]"
          />
        ))}
        {[100, 50].map((level) => (
          <span
            key={level}
            className="absolute inset-x-0 border-t border-dashed border-muted-foreground/40"
            style={{ top: `${y(level)}%` }}
          />
        ))}
        <span className="absolute inset-x-0 bottom-0 border-t" />
        {turn.locks.map(([from, to]) => (
          <Band
            key={from}
            x0={x(turn, from)}
            x1={x(turn, to)}
            y0={y(cutoff)}
            style={hatchStyle}
          />
        ))}
        {locksIn(turn, ahead)
          .slice(turn.locks.length)
          .map(([from, to]) => (
            <Band
              key={from}
              x0={x(turn, from)}
              x1={x(turn, to)}
              y0={y(cutoff)}
              style={forecastHatchStyle}
            />
          ))}
        {turn.resets.map((reset) => (
          <Band
            key={reset}
            x0={x(turn, reset) - 0.35}
            x1={x(turn, reset) + 0.35}
            className="rounded-full bg-foreground"
          />
        ))}
        {line.length === 0 ? (
          <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
            No hourly readings this week
          </span>
        ) : (
          <Strokes>
            <Path
              points={line.map(([at, used]) => [x(turn, at), y(used)])}
              className="text-foreground"
            />
            {forecast === null ? null : (
              <Path
                points={forecast.map(([at, used]) => [x(turn, at), y(used)])}
                className="text-muted-foreground"
                dashed
              />
            )}
          </Strokes>
        )}
        {turn.ranOut === null ? null : (
          <At x={x(turn, turn.ranOut)} y={y(cutoff)}>
            <Dot tone="bad" />
          </At>
        )}
        {runsOut ? (
          <At x={x(turn, forecast[1][0])} y={y(forecast[1][1])}>
            <Dot hollow className="text-bad" />
          </At>
        ) : null}
      </div>
      <div />
      <div className="grid grid-cols-7 pt-1.5 text-center text-xs text-muted-foreground">
        {turn.days.map((day) => (
          <span key={day.from}>{weekday(day.from)}</span>
        ))}
      </div>
    </div>
  );
};

const points = (value: number) =>
  value < 10 ? value.toFixed(1) : String(Math.round(value));

const barHeight = (value: number, top: number) =>
  `${Math.max(2, (value / top) * 100)}%`;

const DayBar = ({ day, top }: { day: WeekDay; top: number }) => {
  const used = day.used ?? 0;
  const over = used > evenPerDay;
  const locked = day.lock !== null && used < 1;

  if (locked) {
    return (
      <div className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
        <span className="text-xs text-bad">locked</span>
        <span
          className="h-1.5 w-full max-w-9 rounded-[2px]"
          style={day.lock === "real" ? hatchStyle : forecastHatchStyle}
        />
      </div>
    );
  }

  const ahead = day.used === null && day.forecast > 0;

  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-end gap-1">
      <span
        className={cn(
          "text-xs tabular-nums",
          over ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {ahead ? `~${points(day.forecast)}` : null}
        {day.used === null ? null : points(used)}
      </span>
      {ahead ? (
        <span
          className="w-full max-w-9 rounded-t-[3px] border border-dashed border-muted-foreground/60"
          style={{ height: barHeight(day.forecast, top) }}
        />
      ) : null}
      {day.used === null ? null : (
        <span
          className={cn(
            "w-full max-w-9 rounded-t-[3px]",
            over ? "bg-over" : "bg-foreground/35"
          )}
          style={{ height: barHeight(used, top) }}
        />
      )}
    </div>
  );
};

const PerDay = ({ turn }: { turn: Turn }) => {
  const top = Math.max(
    evenPerDay * 2,
    ...turn.days.map((day) => (day.used ?? 0) + day.forecast)
  );

  return (
    <div className="space-y-3">
      <div className="text-sm">
        Use per day
        <span className="text-muted-foreground">
          {" "}
          · points of the week, {evenPerDay.toFixed(1)} a day lasts
        </span>
      </div>
      <div className="relative grid h-32 grid-cols-7 gap-2 border-b">
        <span
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/60"
          style={{ bottom: `${(evenPerDay / top) * 100}%` }}
        />
        {turn.days.map((day) => (
          <DayBar key={day.from} day={day} top={top} />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
        {turn.days.map((day) => (
          <span key={day.from}>{weekday(day.from)}</span>
        ))}
      </div>
      <Legend
        items={[
          { fill: "bg-foreground/35", key: "box", label: "Within" },
          { fill: "bg-over", key: "box", label: "Over" },
          {
            className: "text-muted-foreground",
            key: "dash",
            label: `${evenPerDay.toFixed(1)} a day`,
          },
        ]}
      />
    </div>
  );
};

const outNote = (turn: Turn, shift: number | null, projected: boolean) => {
  const [, again] = turn.runOuts;

  if (shift !== null) {
    return `${shiftText(shift)} than the week before`;
  }

  if (projected) {
    return "if the pace holds";
  }

  if (again !== undefined) {
    return `again ${clock(toMinute(again))}`;
  }

  return turn.ranOut === null ? "not this week" : "";
};

const muted = (text: string) => (
  <span className="text-muted-foreground">{text}</span>
);

const Stats = ({
  spiral,
  selected,
  now,
}: {
  spiral: Spiral;
  selected: number;
  now: number;
}) => {
  const turn = spiral.turns[selected];

  if (turn === undefined) {
    return null;
  }

  const ahead = turn.current ? spiral.ahead : null;
  const locks = locksFrom(spiral, turn);
  const end = locks.at(-1)?.[1] ?? null;
  const held = lockedHours(locks, spiral.usual);
  const usualWeek = usualPerWeek(spiral.usual);
  const projected = turn.ranOut === null && ahead !== null;
  const out = turn.ranOut ?? ahead?.[0] ?? null;
  const shift = shiftOf(spiral.turns, selected)?.earlier ?? null;

  return (
    <div className="grid grid-cols-3 gap-4 border-t pt-5">
      <Stat
        compact
        label={muted(projected ? "Runs out" : "Ran out")}
        hint={out === null ? undefined : weekday(toMinute(out))}
        value={
          <span className={cn("whitespace-nowrap", out !== null && "text-bad")}>
            {out === null ? "–" : timeOnly(out)}
          </span>
        }
      >
        <div className="text-sm text-muted-foreground">
          {outNote(turn, shift, projected)}
        </div>
      </Stat>
      <Stat
        compact
        label={muted("Locked")}
        value={held.all === 0 ? "0 h" : span(held.all)}
      >
        <div className="text-sm text-muted-foreground">
          {end === null ? "not this week" : `until ${when(end, now)}`}
        </div>
      </Stat>
      <Stat
        compact
        label={muted("Usual hours")}
        value={usualWeek === 0 ? "–" : `${held.usual} h`}
      >
        <div className="text-sm text-muted-foreground">
          {usualWeek === 0 ? "none regular yet" : `locked, of ${usualWeek}`}
        </div>
      </Stat>
    </div>
  );
};

const Panel = ({
  plan,
  spiral,
  selected,
  now,
}: {
  plan: Plan;
  spiral: Spiral;
  selected: number;
  now: number;
}) => {
  const turn = spiral.turns[selected];

  if (turn === undefined) {
    return null;
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-1">
        <div>{plan.name}</div>
        <div className="text-sm text-muted-foreground">
          {plan.account.plan} · 7-day limit · week of {date(turn.from)}
        </div>
      </div>
      <Curve
        turn={turn}
        pace={plan.pace}
        ahead={turn.current ? spiral.ahead : null}
        now={now}
      />
      <Legend
        items={[
          { key: "line", label: "Used" },
          { key: "dot", label: "Ran out" },
          { key: "hatch", label: "Locked" },
          {
            fill: "h-3 w-0.5 rounded-none bg-foreground",
            key: "box",
            label: "Reset",
          },
        ]}
      />
      <Stats spiral={spiral} selected={selected} now={now} />
      <div className="border-t pt-5">
        <PerDay turn={turn} />
      </div>
    </div>
  );
};

const hasUse = (turn: Turn) => turn.cells.some((cell) => (cell.used ?? 0) > 0);

const depth = (spiral: Spiral) =>
  spiral.turns.filter(hasUse).length * 100 +
  spiral.turns.reduce((sum, turn) => sum + turn.runOuts.length, 0);

const Picker = ({
  plans,
  value,
  next,
  onChange,
}: {
  plans: readonly Plan[];
  value: string;
  next: string | null;
  onChange: (id: string) => void;
}) => (
  <Select
    items={plans.map((plan) => ({ label: plan.name, value: plan.id }))}
    value={value}
    onValueChange={(id) => {
      if (id !== null) {
        onChange(id);
      }
    }}
  >
    <SelectTrigger className="h-9 min-w-36 rounded-full px-3.5">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {plans.map((plan) => (
        <SelectItem key={plan.id} value={plan.id}>
          <span
            className={cn(
              "size-2 rounded-full",
              plan.id === next ? "bg-brand" : "bg-transparent"
            )}
          />
          {plan.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const SpiralView = ({
  plans,
  daily,
  history,
  now,
  chosen,
  setChosen,
  picked,
  setPicked,
}: {
  plans: readonly Plan[];
  daily: { since: number | null; accounts: readonly Daily[] } | null;
  history: Readonly<Record<string, Points>>;
  now: number;
  chosen: string | null;
  setChosen: (id: string) => void;
  picked: number | null;
  setPicked: (from: number | null) => void;
}) => {
  const next = useLive((live) => live.pool?.next ?? null);
  const [focus, setFocus] = useState<Focus | null>(null);

  const since = daily?.since ?? null;

  if (since === null) {
    return <Section title="No weekly history yet">{null}</Section>;
  }

  const drawn = plans.map((one) => ({
    plan: one,
    spiral: spiralOf({
      accountSince: one.account.since,
      daily: daily?.accounts.find((account) => account.id === one.id) ?? {
        days: [],
        id: one.id,
      },
      now,
      pace: one.pace,
      points: history[one.id] ?? [],
      since,
    }),
  }));

  const shown =
    drawn.find((one) => one.plan.id === chosen) ??
    drawn.toSorted((a, b) => depth(b.spiral) - depth(a.spiral))[0];

  if (shown === undefined) {
    return <Section title="No weekly history yet">{null}</Section>;
  }

  const { plan, spiral } = shown;

  const found = spiral.turns.findIndex((turn) => turn.from === picked);
  const selected = found === -1 ? spiral.turns.length - 1 : found;

  return (
    <Section
      title={titleOf(plan, now)}
      detail={detailOf(spiral, plan, now)}
      actions={
        <Picker
          plans={plans}
          value={plan.id}
          next={next}
          onChange={setChosen}
        />
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0 space-y-3">
          <div className="relative mx-auto max-w-[36rem] py-3 sm:px-8">
            <Coil
              spiral={spiral}
              selected={selected}
              now={now}
              onFocus={setFocus}
              onSelect={(index) => {
                setPicked(spiral.turns[index]?.from ?? null);
              }}
            >
              <Center spiral={spiral} selected={selected} now={now} />
            </Coil>
          </div>
          <p className="min-h-5 text-center text-sm text-muted-foreground tabular-nums">
            {readout(focus, spiral)}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <Scale />
            <Legend
              items={[
                { key: "dot", label: "Run-out" },
                {
                  className: "text-bad",
                  key: "hollow",
                  label: "If the pace holds",
                },
                { key: "hatch", label: "Locked" },
                {
                  fill: "border border-dotted border-muted-foreground bg-transparent",
                  key: "box",
                  label: "No reading",
                },
                { className: "text-faint", key: "line", label: "Usual hours" },
              ]}
            />
          </div>
        </div>
        <div className="min-w-0 lg:border-l lg:pl-8">
          <Panel plan={plan} spiral={spiral} selected={selected} now={now} />
        </div>
      </div>
    </Section>
  );
};
