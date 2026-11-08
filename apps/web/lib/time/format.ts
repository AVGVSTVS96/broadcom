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

const weekdayTime = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  weekday: "short",
});

const monthDay = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

const monthDayUtc = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const timeOnly = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const weekdayShort = new Intl.DateTimeFormat("en-US", { weekday: "short" });

const hourOnly = new Intl.DateTimeFormat("en-US", { hour: "numeric" });

export const clock = (at: number) => weekdayTime.format(at);

export const date = (at: number) => monthDay.format(at);

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export const when = (exact: number, now: number) => {
  const at = Math.round(exact / minute) * minute;
  const time = timeOnly.format(at).replace(":00", "");

  if (sameDay(at, now)) {
    return time;
  }

  return Math.abs(at - now) < 6 * DAY ? `${weekdayShort.format(at)} ${time}` : monthDay.format(at);
};

export const utcDate = (at: number) => monthDayUtc.format(at);

export const weekday = (at: number) => weekdayShort.format(at);

export const hour = (at: number) => hourOnly.format(at);

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
