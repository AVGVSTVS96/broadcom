import {
  HOUR,
  WEEK,
  firstReaching,
  lastDrop,
  since,
  valueAt,
} from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import type { LimitWindow } from "@/lib/proxy/schema";

export interface Pace {
  readonly start: number;
  readonly resetsAt: number;
  readonly used: number;
  readonly cutoff: number;
  readonly even: number;
  readonly pace: number | null;
  readonly locked: boolean;
  readonly ranOut: number | null;
  readonly reached: number;
  readonly runsOut: number | null;
  readonly atReset: number;
  readonly line: Points;
}

const minimumSpan = HOUR;

const measure = (
  reached: number,
  base: number,
  span: readonly [from: number, end: number],
  start: number,
  length: number
) => {
  const [from, end] = span;

  const [gained, taken, offset] =
    end - from >= minimumSpan
      ? [reached - base, end - from, base]
      : [reached, end - start, 0];

  return {
    even: Math.min(100, offset + (taken * 100) / length),
    rate: taken > 0 ? Math.max(0, gained) / taken : null,
  };
};

export const windowPace = (
  window: LimitWindow,
  points: Points,
  now: number,
  length = WEEK
): Pace | null => {
  const { used, resetsAt, cutoff } = window;

  if (used === null || resetsAt === null) {
    return null;
  }

  const start = resetsAt - length;
  const counted = Math.max(start, lastDrop(since(points, start)) ?? start);
  const line = since(points, counted);
  const locked = used >= cutoff;
  const ranOut = locked ? firstReaching(line, start, cutoff) : null;
  const end = ranOut ?? window.sampledAt ?? now;
  const from = Math.max(counted, line[0]?.[0] ?? counted);
  const base = valueAt(points, from) ?? 0;
  const reached = ranOut === null ? used : cutoff;
  const { rate, even } = measure(reached, base, [from, end], start, length);
  const left = Math.max(0, resetsAt - now);
  const projected = locked || rate === null ? used : used + rate * left;

  const runsOut =
    !locked && rate !== null && rate > 0 && projected >= cutoff
      ? now + (cutoff - used) / rate
      : null;

  return {
    atReset: Math.min(100, projected),
    cutoff,
    even,
    line,
    locked,
    pace: rate === null ? null : rate / (100 / length),
    ranOut,
    reached,
    resetsAt,
    runsOut,
    start,
    used,
  };
};

export const lockedFor = (pace: Pace) => {
  const from = pace.ranOut ?? pace.runsOut;

  return from === null ? 0 : Math.max(0, pace.resetsAt - from);
};
