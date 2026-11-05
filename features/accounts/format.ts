const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export const span = (ms: number) => {
  const left = Math.max(0, ms);

  if (left < hour) {
    return `${Math.max(1, Math.round(left / minute))} min`;
  }

  if (left < day) {
    const minutes = Math.floor((left % hour) / minute);

    return `${Math.floor(left / hour)} h${minutes === 0 ? "" : ` ${minutes} min`}`;
  }

  const days = Math.floor(left / day);
  const hours = Math.floor((left % day) / hour);

  return `${days} ${days === 1 ? "day" : "days"}${hours === 0 ? "" : ` ${hours} h`}`;
};

export const ago = (at: number, now: number) =>
  now - at < minute ? "just now" : `${span(now - at)} ago`;

const weekday = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  weekday: "short",
});

const calendar = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

const calendarUtc = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export const when = (at: number, now: number) =>
  Math.abs(at - now) < 6 * day
    ? weekday.format(at).replace(":00", "")
    : calendar.format(at);

export const date = (at: number) => calendar.format(at);

export const utcDate = (at: number) => calendarUtc.format(at);

const dollars = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

const wholeDollars = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

export const money = (amount: number) =>
  (Number.isInteger(amount) ? wholeDollars : dollars).format(amount);

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export const resetExpiry = (
  held: number,
  firstExpiry: number | null,
  now: number
) => {
  if (firstExpiry !== null) {
    return `First expires in ${span(firstExpiry - now)}`;
  }

  return held === 0 ? "None held" : "No expiry reported";
};
