import { tzOffset } from "@date-fns/tz";

const minute = 60_000;

const quarterHour = 15 * minute;

const day = 24 * 60 * minute;

export const calendarIn = (zone: string) => {
  const offsets = new Map<number, number>();

  const offset = (ms: number) => {
    const quarter = Math.floor(ms / quarterHour);
    const known = offsets.get(quarter);

    if (known !== undefined) {
      return known;
    }

    const found = tzOffset(zone, new Date(quarter * quarterHour)) * minute;

    offsets.set(quarter, found);

    return found;
  };

  const wall = (ms: number) => new Date(ms + offset(ms));

  const fromWall = (local: number) => {
    const before = offset(local - day);
    const guess = local - before;
    const at = offset(guess);

    if (at === before) {
      return guess;
    }

    const after = offset(local - at);

    return after === at ? local - at : local - Math.min(at, after);
  };

  const startOfDay = (ms: number) => {
    const clock = wall(ms);

    return fromWall(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()));
  };

  const addDays = (ms: number, days: number) => {
    const clock = wall(ms);

    return fromWall(
      Date.UTC(
        clock.getUTCFullYear(),
        clock.getUTCMonth(),
        clock.getUTCDate() + days,
        clock.getUTCHours(),
        clock.getUTCMinutes(),
        clock.getUTCSeconds(),
        clock.getUTCMilliseconds(),
      ),
    );
  };

  const addHours = (dayStart: number, hours: number) => {
    const clock = wall(dayStart);

    return fromWall(
      Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate(), hours),
    );
  };

  const startOfWeek = (ms: number) => {
    const sinceMonday = (wall(ms).getUTCDay() + 6) % 7;

    return addDays(startOfDay(ms), -sinceMonday);
  };

  const lastDays = (now: number, count: number) =>
    Array.from({ length: count }, (_, index) => addDays(startOfDay(now), index - count + 1));

  const instant = (year: number, month: number, date: number, hour = 0, mins = 0, secs = 0) =>
    fromWall(Date.UTC(year, month, date, hour, mins, secs));

  return {
    addDays,
    addHours,
    dayOfMonth: (ms: number) => wall(ms).getUTCDate(),
    hourOfDay: (ms: number) => wall(ms).getUTCHours(),
    instant,
    lastDays,
    startOfDay,
    startOfWeek,
  };
};

export type Calendar = ReturnType<typeof calendarIn>;
