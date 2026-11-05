import { addDays, startOfDay, startOfWeek } from "@/lib/model/calendar";
import { usedBetween } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";

export interface Daily {
  readonly id: string;
  readonly days: readonly (readonly [at: number, used: number])[];
}

export interface Outlook {
  readonly left: number;
  readonly locks: readonly (readonly [from: number, to: number])[];
}

export interface WeekDay {
  readonly from: number;
  readonly used: number | null;
  readonly forecast: number;
  readonly locked: boolean;
  readonly ranOut: boolean;
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

export const weekStarts = (since: number, now: number) => {
  const starts: number[] = [];

  for (let at = startOfWeek(since); at <= now; at = addDays(at, daysInWeek)) {
    starts.push(at);
  }

  return starts;
};

const overlaps = (spans: Outlook["locks"], from: number, to: number) =>
  spans.some(([start, end]) => start < to && end > from);

export const weeksOf = (
  daily: Daily,
  since: number,
  now: number,
  outlook: Outlook
): AccountWeeks => {
  const first = startOfDay(since);
  const today = startOfDay(now);

  const used = new Map(
    daily.days.map(([at, value]) => [startOfDay(at), value])
  );

  const rate =
    daily.days
      .filter(([at]) => at <= now && at > addDays(today, -daysInWeek))
      .reduce((sum, [, value]) => sum + value, 0) / daysInWeek;

  let room = outlook.left;

  const weeks = weekStarts(since, now).map((from): Week => {
    const days = Array.from({ length: daysInWeek }, (_, index): WeekDay => {
      const day = addDays(from, index);
      const next = addDays(day, 1);
      const locked = overlaps(outlook.locks, day, next);
      const ahead = day > today;
      const forecast = ahead && !locked ? Math.min(rate, room) : 0;

      room -= forecast;

      return {
        forecast,
        from: day,
        locked,
        ranOut: outlook.locks.some(([start]) => start >= day && start < next),
        used: day < first || ahead ? null : (used.get(day) ?? 0),
      };
    });

    const total = days.reduce((sum, day) => sum + (day.used ?? 0), 0);

    return {
      current: addDays(from, daysInWeek) > now,
      days,
      expected: total + days.reduce((sum, day) => sum + day.forecast, 0),
      from,
      part: from < first,
      total,
    };
  });

  const base = weeks.find(
    (week) => !week.part && !week.current && week.total >= meaningfulBase
  );

  return { base: base?.total ?? null, id: daily.id, weeks };
};

export const withHistory = (
  daily: Daily,
  points: Points,
  now: number
): Daily => {
  const [first] = points;

  if (first === undefined) {
    return daily;
  }

  const exact: (readonly [number, number])[] = [];

  for (
    let day = addDays(startOfDay(first[0]), 1);
    day <= now;
    day = addDays(day, 1)
  ) {
    exact.push([day, usedBetween(points, day, addDays(day, 1))]);
  }

  const covered = exact[0]?.[0] ?? Infinity;

  return {
    days: [...daily.days.filter(([at]) => startOfDay(at) < covered), ...exact],
    id: daily.id,
  };
};
