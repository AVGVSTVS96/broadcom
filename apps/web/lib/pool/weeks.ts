import { DAY, HOUR, WEEK, lastDrop, lockedSpans, usedBetween } from "@/lib/pool/history";
import type { Points } from "@/lib/pool/history";
import type { Pace } from "@/lib/pool/pace";

export interface Daily {
  readonly id: string;
  readonly days: readonly (readonly [at: number, used: number])[];
}

export interface Outlook {
  readonly since: number | null;
  readonly rate: number;
  readonly room: number;
  readonly cutoff: number;
  readonly resetsAt: number | null;
  readonly locks: readonly (readonly [from: number, to: number])[];
}

export type Mark = "real" | "forecast" | null;

export interface WeekDay {
  readonly from: number;
  readonly to: number;
  readonly used: number | null;
  readonly forecast: number;
  readonly lock: Mark;
  readonly out: Mark;
}

export interface Week {
  readonly from: number;
  readonly to: number;
  readonly days: readonly WeekDay[];
  readonly total: number;
  readonly part: boolean;
  readonly current: boolean;
  readonly expected: number;
}

export interface AccountWeeks {
  readonly id: string;
  readonly weeks: readonly Week[];
  readonly base: number | null;
  readonly locks: Outlook["locks"];
}

const daysInWeek = 7;

const meaningfulBase = 1;

export const evenPerDay = 100 / daysInWeek;

const nextReset = (points: Points, resetsAt: number | null, now: number) => {
  const anchor = resetsAt ?? lastDrop(points);

  if (anchor === null) {
    return null;
  }

  return anchor > now ? anchor : anchor + (Math.floor((now - anchor) / WEEK) + 1) * WEEK;
};

export const limitWeeks = (
  points: Points,
  resetsAt: number | null,
  since: number,
  now: number,
): (readonly [from: number, to: number])[] => {
  const weeks: (readonly [number, number])[] = [];

  for (let end = nextReset(points, resetsAt, now); end !== null && end > since; end -= WEEK) {
    weeks.unshift([end - WEEK, end]);
  }

  return weeks;
};

type Span = readonly [from: number, to: number];

const insideWeeks = (spans: readonly Span[], weeks: readonly Span[]): Span[] =>
  spans.map(([start, end]) => {
    const week = weeks.find(([from, to]) => start >= from && start < to);

    return [start, week === undefined ? end : Math.min(end, week[1])] as const;
  });

const estimateIn = (daily: Daily, from: number, to: number) => {
  let estimated = 0;

  for (const [index, [at, used]] of daily.days.entries()) {
    const next = daily.days[index + 1]?.[0];
    const end = next !== undefined && next - at <= DAY + HOUR ? next : at + DAY;
    const overlap = Math.min(end, to) - Math.max(at, from);

    if (overlap > 0) {
      estimated += (used * overlap) / (end - at);
    }
  }

  return estimated;
};

const overlaps = (spans: Outlook["locks"], from: number, to: number) =>
  spans.some(([start, end]) => start < to && end > from);

export const outlookOf = (
  pace: Pace | null,
  points: Points,
  since: number | null,
  now: number,
): Outlook => ({
  cutoff: pace?.cutoff ?? 100,
  locks: lockedSpans(points, pace?.cutoff ?? 100, pace?.locked === true ? pace.resetsAt : now),
  rate: pace?.rate ?? 0,
  resetsAt: pace?.resetsAt ?? null,
  room: pace === null || pace.locked ? 0 : Math.max(0, pace.cutoff - pace.used),
  since,
});

const markOf = (real: boolean, forecast: boolean): Mark => {
  if (real) {
    return "real";
  }

  return forecast ? "forecast" : null;
};

const forecaster = (outlook: Outlook) => {
  let { room } = outlook;
  let ranOut: number | null = null;

  const spend = (from: number, to: number) => {
    const spent = Math.min(room, outlook.rate * Math.max(0, to - from));

    room -= spent;

    if (room <= 0 && ranOut === null && spent > 0) {
      ranOut = from + spent / outlook.rate;
    }

    return spent;
  };

  return (from: number, to: number) => {
    const { resetsAt: reset } = outlook;

    if (reset === null || reset <= from || reset >= to) {
      const spent = spend(from, to);

      return { lockedUntil: reset, ranOut, spent };
    }

    const before = spend(from, reset);
    const lockedFrom = ranOut;

    room = outlook.cutoff;
    ranOut = null;

    return {
      lockedUntil: reset,
      ranOut: lockedFrom,
      spent: before + spend(reset, to),
    };
  };
};

export const weeksOf = ({
  daily,
  points,
  since,
  now,
  outlook,
}: {
  daily: Daily;
  points: Points;
  since: number;
  now: number;
  outlook: Outlook;
}): AccountWeeks => {
  const first = Math.max(since, outlook.since ?? since);
  const [opening] = points;
  const exactFrom = opening?.[0] ?? Infinity;
  const forecast = forecaster(outlook);
  const spans = limitWeeks(points, outlook.resetsAt, since, now);
  const locks = insideWeeks(outlook.locks, spans);

  const weeks = spans.map(([from, to]): Week => {
    const slots = Array.from({ length: daysInWeek }, (_, index) => {
      const day = from + index * DAY;
      const next = day + DAY;
      const start = Math.max(day, first);
      const end = Math.min(next, now);
      const counted = next > first && day <= now;

      return {
        counted,
        day,
        estimate: counted ? estimateIn(daily, start, Math.min(end, exactFrom)) : 0,
        exact:
          counted && end > exactFrom ? usedBetween(points, Math.max(start, exactFrom), end) : 0,
        next,
      };
    });

    const opensHere = opening !== undefined && from < exactFrom && exactFrom < to;
    const estimated = slots.reduce((sum, slot) => sum + slot.estimate, 0);
    const scale = opensHere && estimated > 0 ? opening[1] / estimated : 1;

    const days = slots.map(({ day, next, counted, estimate, exact }): WeekDay => {
      const ahead = next > now;

      const outlookDay = ahead
        ? forecast(Math.max(day, now), next)
        : { lockedUntil: null, ranOut: null, spent: 0 };

      const forecastOut =
        outlookDay.ranOut !== null && outlookDay.ranOut >= day && outlookDay.ranOut < next;

      const forecastLock =
        outlookDay.ranOut !== null &&
        outlookDay.ranOut < next &&
        (outlookDay.lockedUntil === null || outlookDay.lockedUntil > day);

      const unseen =
        opensHere && estimated === 0 && exactFrom >= day && exactFrom < next ? opening[1] : 0;

      return {
        forecast: outlookDay.spent,
        from: day,
        lock: markOf(overlaps(locks, day, next), forecastLock),
        out: markOf(
          locks.some(([start]) => start >= day && start < next),
          forecastOut,
        ),
        to: next,
        used: counted ? estimate * scale + exact + unseen : null,
      };
    });

    const total = days.reduce((sum, day) => sum + (day.used ?? 0), 0);

    return {
      current: to > now,
      days,
      expected: total + days.reduce((sum, day) => sum + day.forecast, 0),
      from,
      part: since - from > HOUR,
      to,
      total,
    };
  });

  const base = weeks.find((week) => !week.part && !week.current && week.total >= meaningfulBase);

  return { base: base?.total ?? null, id: daily.id, locks, weeks };
};
