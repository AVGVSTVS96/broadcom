import { DAY, HOUR, WEEK, firstReaching, lastDrop, since, valueAt } from "@/lib/pool/history";
import type { Point, Points } from "@/lib/pool/history";
import type { Account, LimitWindow } from "@/lib/proxy/schema";
import { percent, times } from "@/lib/time/format";
import type { Time } from "@/lib/time/zone";

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

  return left[1] + ((right[1] - left[1]) * (at - left[0])) / (right[0] - left[0]);
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

  return latest[0] - last > 2 * gap ? [...found, [latest[0], Math.max(high, latest[1])]] : found;
};

export const windowPace = (
  window: LimitWindow,
  points: Points,
  now: number,
  length = WEEK,
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

  const runsOut = locked || trend.rate === 0 ? null : Math.max(latest, trend.reach(cutoff));

  return {
    atReset: locked ? used : Math.min(100, Math.max(used, trend.at(resetsAt))),
    cutoff,
    even,
    line,
    locked,
    pace: locked || even === 0 ? null : used / even,
    ranOut,
    rate: ranOut === null ? trend.rate : cutoff / Math.max(minimumSpan, ranOut - start),
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

export const outcome = (pace: Pace, now: number, { when }: Time) => {
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

export interface Dry {
  readonly at: number;
  readonly left: number;
  readonly back: number;
  readonly resets: number;
  readonly perHour: number;
}

// WHY: the proxy spends a reset only when no week comes back for 12 hours (poolDrySpell).
const drySpell = 12 * HOUR;

export const poolDry = (
  plans: readonly { readonly pace: Pace; readonly account: Account }[],
  now: number,
): Dry | null => {
  const open = plans.filter(({ pace }) => !pace.locked);
  const left = open.reduce((sum, { pace }) => sum + Math.max(0, pace.cutoff - pace.used), 0);
  const rate = open.reduce((sum, { pace }) => sum + pace.rate, 0);
  const firstBack = Math.min(...plans.map(({ pace }) => pace.resetsAt));

  // WHY: an account's resets share one week, so only its biggest gives back this week.
  const gives = plans
    .flatMap(({ account }) => {
      const most = Math.max(0, ...account.heldResets.map((reset) => reset.givesBack ?? 0));

      return most > 0 ? [most] : [];
    })
    .toSorted((a, b) => b - a);

  if (rate === 0) {
    return null;
  }

  let at = now + left / rate;
  let back = 0;
  let resets = 0;

  for (const give of gives) {
    if (firstBack - at < drySpell) {
      break;
    }

    at += give / rate;
    back += give;
    resets += 1;
  }

  return at >= firstBack ? null : { at, back, left, perHour: rate * HOUR, resets };
};
