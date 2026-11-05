import { clock, date, duration } from "@/lib/model/format";

export const when = (at: number, now: number) =>
  Math.abs(at - now) < 6 * 86_400_000 ? clock(at).replace(":00", "") : date(at);

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

export const resetExpiry = (
  held: number,
  firstExpiry: number | null,
  now: number
) => {
  if (firstExpiry !== null) {
    return `First expires in ${duration(firstExpiry - now)}`;
  }

  return held === 0 ? "None held" : "No expiry reported";
};
