import { addDays, startOfDay, startOfWeek } from "@/lib/model/calendar";

export interface Daily {
  readonly id: string;
  readonly days: readonly (readonly [at: number, used: number])[];
}

export interface Week {
  readonly from: number;
  readonly days: readonly (number | null)[];
  readonly total: number;
  readonly part: boolean;
  readonly current: boolean;
  readonly forecast: number | null;
}

export interface AccountWeeks {
  readonly id: string;
  readonly weeks: readonly Week[];
  readonly base: number | null;
}

const daysInWeek = 7;

export const evenPerDay = 100 / daysInWeek;

export const weekStarts = (since: number, now: number) => {
  const starts: number[] = [];

  for (let at = startOfWeek(since); at <= now; at = addDays(at, daysInWeek)) {
    starts.push(at);
  }

  return starts;
};

export const weeksOf = (
  daily: Daily,
  since: number,
  now: number
): AccountWeeks => {
  const first = startOfDay(since);
  const today = startOfDay(now);

  const used = new Map(
    daily.days.map(([at, value]) => [startOfDay(at), value])
  );

  const weeks = weekStarts(since, now).map((from): Week => {
    const days = Array.from({ length: daysInWeek }, (_, index) => {
      const day = addDays(from, index);

      return day < first || day > today ? null : (used.get(day) ?? 0);
    });

    const counted = days.filter((value) => value !== null);
    const total = counted.reduce((sum, value) => sum + value, 0);
    const current = addDays(from, daysInWeek) > now;

    return {
      current,
      days,
      forecast:
        current && counted.length > 0
          ? (total / counted.length) * daysInWeek
          : null,
      from,
      part: from < first,
      total,
    };
  });

  const base = weeks.find(
    (week) => !week.part && !week.current && week.total > 0
  );

  return { base: base?.total ?? null, id: daily.id, weeks };
};
