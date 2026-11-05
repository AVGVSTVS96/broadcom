import { DAY, HOUR } from "@/lib/model/history";

const minute = 60_000;

export const duration = (ms: number) => {
  if (ms < minute) {
    return "<1 min";
  }

  if (ms < HOUR) {
    return `${Math.round(ms / minute)} min`;
  }

  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.round((ms % HOUR) / minute);

    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
  }

  const days = Math.floor(ms / DAY);
  const hours = Math.round((ms % DAY) / HOUR);
  const unit = days === 1 ? "day" : "days";

  return hours === 0 ? `${days} ${unit}` : `${days} ${unit} ${hours} h`;
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

const weekdayShort = new Intl.DateTimeFormat("en-US", { weekday: "short" });

const hourOnly = new Intl.DateTimeFormat("en-US", { hour: "numeric" });

export const clock = (at: number) => weekdayTime.format(at);

export const date = (at: number) => monthDay.format(at);

export const utcDate = (at: number) => monthDayUtc.format(at);

export const weekday = (at: number) => weekdayShort.format(at);

export const hour = (at: number) => hourOnly.format(at);

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

export const times = (value: number) =>
  `${value < 10 ? value.toFixed(1) : Math.round(value)}×`;
