export type Point = readonly [at: number, used: number];

export type Points = readonly Point[];

export const HOUR = 3_600_000;

export const DAY = 24 * HOUR;

export const WEEK = 7 * DAY;

const resetDrop = 3;

export const compact = (points: Points): Points =>
  points.filter(
    (point, index) =>
      index === 0 ||
      index === points.length - 1 ||
      point[1] !== points[index - 1]?.[1] ||
      point[1] !== points[index + 1]?.[1]
  );

export const valueAt = (points: Points, at: number) => {
  let value: number | null = null;

  for (const [time, used] of points) {
    if (time > at) {
      break;
    }

    value = used;
  }

  return value;
};

export const usedBetween = (points: Points, from: number, to: number) => {
  let sum = 0;
  let high = points[0]?.[1] ?? 0;

  for (const [at, used] of points) {
    if (used < high - resetDrop) {
      high = used;
    } else if (used > high) {
      if (at >= from && at < to) {
        sum += used - high;
      }

      high = used;
    }
  }

  return sum;
};

export const drops = (points: Points) => {
  const found: number[] = [];
  let before = points[0]?.[1] ?? 0;

  for (const [time, used] of points) {
    if (used < before - resetDrop) {
      found.push(time);
    }

    before = used;
  }

  return found;
};

export const lastDrop = (points: Points) => drops(points).at(-1) ?? null;

export const since = (points: Points, from: number) => {
  const first = points.findIndex(([at]) => at >= from);

  return first === -1 ? [] : points.slice(first);
};

export const firstReaching = (points: Points, from: number, level: number) =>
  points.find(([at, used]) => at >= from && used >= level)?.[0] ?? null;

export const lockedSpans = (points: Points, cutoff: number, end: number) => {
  const spans: [from: number, to: number][] = [];
  let from: number | null = null;
  let high = points[0]?.[1] ?? 0;

  for (const [at, used] of points) {
    if (used < high - resetDrop) {
      if (from !== null) {
        spans.push([from, at]);
        from = null;
      }

      high = used;
    }

    high = Math.max(high, used);

    if (from === null && used >= cutoff) {
      from = at;
    }
  }

  if (from !== null) {
    spans.push([from, end]);
  }

  return spans;
};

export const isLocked = (
  spans: readonly (readonly [number, number])[],
  at: number
) => spans.some(([from, to]) => at >= from && at < to);
