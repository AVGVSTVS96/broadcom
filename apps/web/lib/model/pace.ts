import { percent, times, when } from "@/lib/model/format";
import {
  DAY,
  HOUR,
  WEEK,
  firstReaching,
  lastDrop,
  since,
  valueAt,
} from "@/lib/model/history";
import type { Point, Points } from "@/lib/model/history";
import type { LimitWindow } from "@/lib/proxy/schema";

export interface Pace {
  readonly start: number;
  readonly restarted: boolean;
  readonly resetsAt: number;
  readonly used: number;
  readonly cutoff: number;
  readonly even: number;
  readonly pace: number | null;
  readonly rate: number;
  readonly locked: boolean;
  readonly ranOut: number | null;
  readonly runsOut: number | null;
  readonly atReset: number;
  readonly line: Points;
}

const trailing = DAY;

const minimumSpan = HOUR;

const fit = (points: Points) => {
  let meanX = 0;
  let meanY = 0;

  for (const [x, y] of points) {
    meanX += x / points.length;
    meanY += y / points.length;
  }

  let cross = 0;
  let spread = 0;

  for (const [x, y] of points) {
    cross += (x - meanX) * (y - meanY);
    spread += (x - meanX) ** 2;
  }

  const rate = spread === 0 ? 0 : Math.max(0, cross / spread);

  return {
    at: (time: number) => meanY + rate * (time - meanX),
    rate,
    reach: (level: number) => meanX + (level - meanY) / rate,
  };
};

const between = (line: Points, at: number) => {
  const after = line.findIndex(([time]) => time > at);
  const right = line[after];
  const left = line[after - 1];

  if (left === undefined || right === undefined) {
    return valueAt(line, at) ?? 0;
  }

  return (
    left[1] + ((right[1] - left[1]) * (at - left[0])) / (right[0] - left[0])
  );
};

const rises = (line: Points, from: number, latest: Point): Points => {
  let high = between(line, from);
  const found: Point[] = [[from, high]];

  for (const [at, used] of line) {
    if (at > from && used > high) {
      high = used;
      found.push([at, used]);
    }
  }

  const last = found.at(-1)?.[0] ?? from;
  const gap = (latest[0] - from) / found.length;

  return latest[0] - last > 2 * gap
    ? [...found, [latest[0], Math.max(high, latest[1])]]
    : found;
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

  const nominal = resetsAt - length;
  const start = Math.max(nominal, lastDrop(since(points, nominal)) ?? nominal);
  const line = since(points, start);
  const span = resetsAt - start;
  const locked = used >= cutoff;
  const ranOut = locked ? firstReaching(line, start, cutoff) : null;
  const latest = window.sampledAt ?? now;
  const end = ranOut ?? latest;
  const even = Math.min(100, ((end - start) * 100) / span);
  const from = Math.max(start, latest - trailing);

  const trend =
    latest - from >= minimumSpan
      ? fit(rises(line, from, [latest, used]))
      : fit([
          [start, 0],
          [Math.max(start + minimumSpan, latest), used],
        ]);

  const runsOut =
    locked || trend.rate === 0 ? null : Math.max(latest, trend.reach(cutoff));

  return {
    atReset: locked ? used : Math.min(100, Math.max(used, trend.at(resetsAt))),
    cutoff,
    even,
    line,
    locked,
    pace: locked || even === 0 ? null : used / even,
    ranOut,
    rate:
      ranOut === null
        ? trend.rate
        : cutoff / Math.max(minimumSpan, ranOut - start),
    resetsAt,
    restarted: start > nominal,
    runsOut: runsOut === null || runsOut >= resetsAt ? null : runsOut,
    start,
    used,
  };
};

export const lockedFor = (pace: Pace) => {
  const from = pace.ranOut ?? pace.runsOut;

  return from === null ? 0 : Math.max(0, pace.resetsAt - from);
};

export const outcome = (pace: Pace, now: number) => {
  if (pace.locked) {
    return {
      bad: true,
      note: pace.ranOut === null ? null : `Ran out ${when(pace.ranOut, now)}`,
      text: `Back ${when(pace.resetsAt, now)}`,
    };
  }

  const note = `${times(pace.pace ?? 0)} even pace · ${percent(pace.used)} used`;

  return pace.runsOut === null
    ? { bad: false, note, text: `~${percent(pace.atReset)} at reset` }
    : { bad: true, note, text: `Runs out ${when(pace.runsOut, now)}` };
};
