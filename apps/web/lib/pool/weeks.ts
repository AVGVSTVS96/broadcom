import { lockedSpans, usedBetween } from "@/lib/pool/history";
import type { Points } from "@/lib/pool/history";
import type { Pace } from "@/lib/pool/pace";
import type { Calendar } from "@/lib/time/calendar";

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
  readonly used: number | null;
  readonly forecast: number;
  readonly lock: Mark;
  readonly out: Mark;
}

export interface Week {
  readonly from: number;
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
}

const daysInWeek = 7;

const meaningfulBase = 1;

export const evenPerDay = 100 / daysInWeek;

export const weekStarts = (since: number, now: number, { addDays, startOfWeek }: Calendar) => {
  const starts: number[] = [];

  for (let at = startOfWeek(since); at <= now; at = addDays(at, daysInWeek)) {
    starts.push(at);
  }

  return starts;
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
  locks: pace === null ? [] : lockedSpans(points, pace.cutoff, pace.locked ? pace.resetsAt : now),
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

export const weeksOf = (
  daily: Daily,
  since: number,
  now: number,
  outlook: Outlook,
  calendar: Calendar,
): AccountWeeks => {
  const { addDays, startOfDay } = calendar;
  const first = startOfDay(Math.max(since, outlook.since ?? since));
  const today = startOfDay(now);
  const forecast = forecaster(outlook);

  const used = new Map(daily.days.map(([at, value]) => [startOfDay(at), value]));

  const weeks = weekStarts(since, now, calendar).map((from): Week => {
    const days = Array.from({ length: daysInWeek }, (_, index): WeekDay => {
      const day = addDays(from, index);
      const next = addDays(day, 1);
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

      const realLock = overlaps(outlook.locks, day, next);

      const realOut = outlook.locks.some(([start]) => start >= day && start < next);

      return {
        forecast: outlookDay.spent,
        from: day,
        lock: markOf(realLock, forecastLock),
        out: markOf(realOut, forecastOut),
        used: day < first || day > today ? null : (used.get(day) ?? 0),
      };
    });

    const total = days.reduce((sum, day) => sum + (day.used ?? 0), 0);

    return {
      current: addDays(from, daysInWeek) > now,
      days,
      expected: total + days.reduce((sum, day) => sum + day.forecast, 0),
      from,
      part: from < startOfDay(since),
      total,
    };
  });

  const base = weeks.find((week) => !week.part && !week.current && week.total >= meaningfulBase);

  return { base: base?.total ?? null, id: daily.id, weeks };
};

export const withHistory = (
  daily: Daily,
  points: Points,
  now: number,
  { addDays, startOfDay }: Calendar,
): Daily => {
  const [first] = points;

  if (first === undefined) {
    return daily;
  }

  const exact: (readonly [number, number])[] = [];

  for (let day = addDays(startOfDay(first[0]), 1); day <= now; day = addDays(day, 1)) {
    exact.push([day, usedBetween(points, day, addDays(day, 1))]);
  }

  const covered = exact[0]?.[0] ?? Infinity;

  return {
    days: [...daily.days.filter(([at]) => startOfDay(at) < covered), ...exact],
    id: daily.id,
  };
};
