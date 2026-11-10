import { HOUR, drops, isLocked, usedBetween, valueAt } from "@/lib/pool/history";
import type { Point, Points } from "@/lib/pool/history";
import type { Pace } from "@/lib/pool/pace";
import { outlookOf, weeksOf } from "@/lib/pool/weeks";
import type { Daily, WeekDay } from "@/lib/pool/weeks";
import type { Calendar } from "@/lib/time/calendar";

export type Span = readonly [from: number, to: number];

export interface Cell {
  readonly from: number;
  readonly to: number;
  readonly used: number | null;
}

export interface Turn {
  readonly from: number;
  readonly to: number;
  readonly current: boolean;
  readonly part: boolean;
  readonly cells: readonly Cell[];
  readonly days: readonly WeekDay[];
  readonly locks: readonly Span[];
  readonly resets: readonly number[];
  readonly runOuts: readonly number[];
  readonly ranOut: number | null;
  readonly line: Points;
}

export interface Spiral {
  readonly turns: readonly Turn[];
  readonly exactFrom: number | null;
  readonly locks: readonly Span[];
  readonly ahead: Span | null;
  readonly usual: readonly boolean[];
}

const usedHour = 0.05;

const usualShare = 0.5;

const usualDays = 2;

const clip = (spans: readonly Span[], from: number, to: number): Span[] =>
  spans.flatMap(([start, end]) =>
    start < to && end > from ? [[Math.max(start, from), Math.min(end, to)] as const] : [],
  );

const hoursOf = (from: number, to: number) => {
  const starts: number[] = [];

  for (let at = from; at < to; at += HOUR) {
    starts.push(at);
  }

  return starts;
};

const cellsOf = (
  days: readonly WeekDay[],
  points: Points,
  exactFrom: number | null,
  now: number,
): Cell[] =>
  days.flatMap((day): Cell[] => {
    const end = Math.min(day.to, now);

    if (day.from >= end) {
      return [];
    }

    if (exactFrom === null || end <= exactFrom) {
      return [{ from: day.from, to: end, used: day.used }];
    }

    return hoursOf(day.from, end).map((from) => ({
      from,
      to: Math.min(from + HOUR, end),
      used: from < exactFrom ? null : usedBetween(points, from, Math.min(from + HOUR, end)),
    }));
  });

const usualOf = (
  cells: readonly Cell[],
  locks: readonly Span[],
  exactFrom: number | null,
  { hourOfDay }: Calendar,
) => {
  const seen = Array.from({ length: 24 }, () => ({ total: 0, used: 0 }));

  for (const cell of cells) {
    const full = cell.to - cell.from === HOUR;

    if (
      exactFrom === null ||
      cell.from < exactFrom ||
      !full ||
      cell.used === null ||
      isLocked(locks, cell.from + HOUR / 2)
    ) {
      continue;
    }

    const slot = seen[hourOfDay(cell.from)];

    if (slot !== undefined) {
      slot.total += 1;
      slot.used += cell.used > usedHour ? 1 : 0;
    }
  }

  return seen.map(({ total, used }) => total >= usualDays && used / total >= usualShare);
};

const lineOf = (points: Points, from: number, to: number): Points => {
  const inside = points.filter(([at]) => at >= from && at <= to);
  const start: Point[] = valueAt(points, from) === null ? [] : [[from, 0]];

  return [...start, ...inside];
};

export const spiralOf = ({
  points,
  daily,
  since,
  pace,
  accountSince,
  now,
  calendar,
}: {
  points: Points;
  daily: Daily;
  since: number;
  pace: Pace | null;
  accountSince: number | null;
  now: number;
  calendar: Calendar;
}): Spiral => {
  const first = points[0]?.[0];
  const exactFrom = first === undefined ? null : first - (first % HOUR);
  const cutoff = pace?.cutoff ?? 100;

  const { locks, weeks } = weeksOf({
    daily,
    now,
    outlook: outlookOf(pace, points, accountSince, now),
    points,
    since,
  });

  const [opening] = points;
  const lockedAtStart = opening !== undefined && opening[1] >= cutoff;

  const runOuts = locks.map(([from]) => from).filter((at) => !(lockedAtStart && at === opening[0]));

  const resets = [
    ...drops(points),
    ...(pace !== null && pace.resetsAt > now ? [pace.resetsAt] : []),
  ];

  const all = weeks.map((week): Turn => {
    const { to } = week;

    const inside = runOuts.filter((at) => at >= week.from && at < to);

    return {
      cells: cellsOf(week.days, points, exactFrom, now),
      current: week.current,
      days: week.days,
      from: week.from,
      line: lineOf(points, week.from, to),
      locks: clip(locks, week.from, to),
      part: week.part,
      ranOut: inside[0] ?? null,
      resets: resets.filter((at) => at >= week.from && at < to),
      runOuts: inside,
      to,
    };
  });

  const opened = all.findIndex(
    (turn) => turn.current || turn.cells.some((cell) => cell.used !== null),
  );

  const turns = all.slice(Math.max(0, opened));

  const ahead =
    pace === null || pace.locked || pace.runsOut === null
      ? null
      : ([pace.runsOut, pace.resetsAt] as const);

  return {
    ahead,
    exactFrom,
    locks: locks.filter(([from]) => runOuts.includes(from)),
    turns,
    usual: usualOf(
      turns.flatMap((turn) => turn.cells),
      locks,
      exactFrom,
      calendar,
    ),
  };
};

export const lockedHours = (
  spans: readonly Span[],
  usual: readonly boolean[],
  { hourOfDay }: Calendar,
) => {
  let all = 0;
  let inUsual = 0;

  for (const [from, to] of spans) {
    for (let at = from; at < to; at += HOUR) {
      const part = Math.min(HOUR, to - at);

      all += part;
      inUsual += usual[hourOfDay(at)] === true ? part : 0;
    }
  }

  return { all, usual: Math.round(inUsual / HOUR) };
};

export const usualPerWeek = (usual: readonly boolean[]) => usual.filter(Boolean).length * 7;

export const locksIn = (turn: Turn, ahead: Span | null): Span[] => [
  ...turn.locks,
  ...clip(ahead === null ? [] : [ahead], turn.from, turn.to),
];

export const locksFrom = (spiral: Spiral, turn: Turn): Span[] =>
  [...spiral.locks, ...(turn.current && spiral.ahead !== null ? [spiral.ahead] : [])].filter(
    ([from]) => from >= turn.from && from < turn.to,
  );

export const shiftOf = (turns: readonly Turn[], index: number) => {
  const turn = turns[index];

  const before = turns.slice(0, index).findLast((earlier) => earlier.ranOut !== null);

  const mine = turn?.ranOut ?? null;
  const theirs = before?.ranOut ?? null;

  if (turn === undefined || before === undefined || mine === null || theirs === null) {
    return null;
  }

  return {
    earlier: theirs - before.from - (mine - turn.from),
    than: before.from,
  };
};
