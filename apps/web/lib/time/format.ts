import { DAY, HOUR } from "@/lib/pool/history";

const minute = 60_000;

export const duration = (ms: number) => {
  if (ms < minute) {
    return "<1 min";
  }

  const minutes = Math.round(ms / minute);

  if (minutes < 60) {
    return `${minutes} min`;
  }

  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }

  const hours = Math.round(ms / HOUR);
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const unit = days === 1 ? "day" : "days";

  return rest === 0 ? `${days} ${unit}` : `${days} ${unit} ${rest} h`;
};

export const ago = (at: number, now: number) =>
  now - at < minute ? "just now" : `${duration(now - at)} ago`;

const monthDayUtc = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export const utcDate = (at: number) => monthDayUtc.format(at);

const hourUtc = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" });

export const hourLabel = (hourOfDay: number) => hourUtc.format(Date.UTC(2026, 0, 1, hourOfDay));

export const formatsIn = (zone: string, startOfDay: (at: number) => number) => {
  const formatter = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...options, timeZone: zone });

  const weekdayTime = formatter({ hour: "numeric", minute: "2-digit", weekday: "short" });
  const monthDay = formatter({ day: "numeric", month: "short" });
  const timeOnly = formatter({ hour: "numeric", minute: "2-digit" });
  const weekdayShort = formatter({ weekday: "short" });
  const hourOnly = formatter({ hour: "numeric" });
  const hourMinute = formatter({ hour: "2-digit", hourCycle: "h23", minute: "2-digit" });
  const dayOfYear = formatter({ day: "numeric", month: "short", weekday: "short" });

  const dayWithYear = formatter({
    day: "numeric",
    month: "short",
    weekday: "short",
    year: "numeric",
  });

  const yearOnly = formatter({ year: "numeric" });

  const when = (exact: number, now: number) => {
    const at = Math.round(exact / minute) * minute;
    const time = timeOnly.format(at).replace(":00", "");

    if (startOfDay(at) === startOfDay(now)) {
      return time;
    }

    return Math.abs(at - now) < 6 * DAY
      ? `${weekdayShort.format(at)} ${time}`
      : monthDay.format(at);
  };

  return {
    clock: (at: number) => weekdayTime.format(at),
    clock24: (at: number) => hourMinute.format(at),
    date: (at: number) => monthDay.format(at),
    day: (at: number, now: number) =>
      (yearOnly.format(at) === yearOnly.format(now) ? dayOfYear : dayWithYear).format(at),
    hour: (at: number) => hourOnly.format(at),
    timeOfDay: (at: number) => timeOnly.format(at),
    weekday: (at: number) => weekdayShort.format(at),
    when,
  };
};

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export const percent = (value: number) => `${Math.round(value)}%`;

const usd = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

const usdWhole = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

export const dollars = (value: number) =>
  value >= 100 ? usdWhole.format(value) : usd.format(value);

export const times = (value: number) => `${value < 10 ? value.toFixed(1) : Math.round(value)}×`;
