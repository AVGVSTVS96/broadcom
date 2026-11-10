import { calendarIn } from "@/lib/time/calendar";
import { formatsIn } from "@/lib/time/format";

export const zoneCookie = "tz";

export const hostZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export const zoneOf = (name: string | undefined) => {
  if (name === undefined || name === "") {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

const timeOf = (zone: string) => {
  const calendar = calendarIn(zone);

  return { ...calendar, ...formatsIn(zone, calendar.startOfDay), zone };
};

export type Time = ReturnType<typeof timeOf>;

const made = new Map<string, Time>();

export const timeIn = (zone: string) => {
  const found = made.get(zone);

  if (found !== undefined) {
    return found;
  }

  const time = timeOf(zone);

  made.set(zone, time);

  return time;
};
