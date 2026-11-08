import type { BucketSize, UsageAmount, UsagePoints } from "@/lib/proxy/schema";

export const ranges = ["today", "7d", "30d", "6m"] as const;

export type Range = (typeof ranges)[number];

export const units = ["tokens", "api", "plan", "fiveHour", "week"] as const;

export type Unit = (typeof units)[number];

export const groupings = ["agent", "session", "project", "model", "account"] as const;

export type Grouping = (typeof groupings)[number];

export const oneOf = <T extends string>(
  options: readonly T[],
  value: string | null | undefined,
  fallback: T,
): T => options.find((option) => option === value) ?? fallback;

export type Values = Readonly<Record<Unit, number | null>>;

export const isLimit = (unit: Unit) => unit === "fiveHour" || unit === "week";

export const valuesOf = (amount: UsageAmount, points: UsagePoints): Values => {
  const reading = (value: number | null) => (value === 0 && amount.apiUsd > 0 ? null : value);

  return {
    api: amount.apiUsd,
    fiveHour: reading(points.fiveHour),
    plan: amount.planUsd,
    tokens: amount.tokens,
    week: reading(points.week),
  };
};

const compact = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
  notation: "compact",
});

const dollars = new Intl.NumberFormat("en", {
  currency: "USD",
  maximumFractionDigits: 0,
  style: "currency",
});

const cents = new Intl.NumberFormat("en", {
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: "currency",
});

const points = (value: number) => {
  if (value === 0) {
    return "0%";
  }

  if (value < 0.1) {
    return "<0.1%";
  }

  if (value >= 100) {
    return `${(Math.round(value / 10) / 10).toFixed(1)} limits`;
  }

  return `${value < 10 ? value.toFixed(1) : Math.round(value).toLocaleString("en")}%`;
};

const usd = (value: number) => {
  if (value >= 10_000) {
    return `$${compact.format(value)}`;
  }

  return value >= 100 ? dollars.format(value) : cents.format(value);
};

export const format = (unit: Unit, value: number | null) => {
  if (value === null) {
    return "–";
  }

  if (unit === "tokens") {
    return value < 1000 ? String(Math.round(value)) : compact.format(value);
  }

  if (unit === "api" || unit === "plan") {
    return usd(value);
  }

  return points(value);
};

const brief = (value: number) => {
  if (value >= 1000) {
    return compact.format(value);
  }

  return value >= 10 || value === 0 ? String(Math.round(value)) : value.toFixed(1);
};

export const formatShort = (unit: Unit, value: number) => {
  if (unit === "api" || unit === "plan") {
    return `$${brief(value)}`;
  }

  return unit === "tokens" ? brief(value) : `${brief(value)}%`;
};

export interface Cell {
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly now: number | null;
}

const hour = 3_600_000;

const day = 24 * hour;

const partsIn = (zone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    hourCycle: "h23",
    month: "short",
    timeZone: zone,
    weekday: "short",
    year: "numeric",
  });

  return (at: number) => {
    const read = Object.fromEntries(parts.formatToParts(at).map((part) => [part.type, part.value]));

    return {
      date: `${read.year} ${read.month} ${read.day}`,
      day: `${read.month} ${read.day}`,
      hour: Number(read.hour),
      month: read.month ?? "",
      weekday: read.weekday ?? "",
    };
  };
};

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const spans = {
  "1d": day,
  "1h": hour,
  "1w": 7 * day,
  "4h": 4 * hour,
} as const satisfies Record<BucketSize, number>;

const nowLabels = {
  "1d": "This week",
  "1h": null,
  "1w": null,
  "4h": "Today",
} as const satisfies Record<BucketSize, string | null>;

export const cellsOf = (
  buckets: readonly { readonly at: number }[],
  size: BucketSize,
  zone: string,
  now: number,
): readonly Cell[] => {
  const read = partsIn(zone);

  const keyOf = (at: number) => {
    const parts = read(at);

    if (size === "1h") {
      const block = Math.floor(parts.hour / 6) * 6;

      return {
        key: `${parts.date} ${block}`,
        label: `${String(block).padStart(2, "0")}:00`,
      };
    }

    if (size === "4h") {
      return { key: parts.date, label: parts.weekday };
    }

    if (size === "1d") {
      const monday = at + 12 * hour - weekdays.indexOf(parts.weekday) * day;

      return { key: read(monday).date, label: parts.day };
    }

    return { key: parts.month, label: parts.month };
  };

  const groups: { key: string; label: string; from: number }[] = [];

  for (const [index, bucket] of buckets.entries()) {
    const { key, label } = keyOf(bucket.at);

    if (groups.at(-1)?.key !== key) {
      groups.push({ from: index, key, label });
    }
  }

  const current = buckets.findLastIndex((bucket) => bucket.at <= now);
  const ended = (buckets.at(-1)?.at ?? 0) + spans[size] <= now;

  return groups.map((group, index) => {
    const to = groups[index + 1]?.from ?? buckets.length;
    const holdsNow = !ended && current >= group.from && current < to;

    return {
      from: group.from,
      label: holdsNow ? (nowLabels[size] ?? group.label) : group.label,
      now: holdsNow ? current - group.from : null,
      to,
    };
  });
};

export const sumCells = (series: readonly number[], cells: readonly Cell[]): readonly number[] =>
  cells.map((cell) => series.slice(cell.from, cell.to).reduce((sum, value) => sum + value, 0));

export const sumSeries = (lists: readonly (readonly number[])[]) => {
  const total: number[] = [];

  for (const list of lists) {
    for (const [index, value] of list.entries()) {
      total[index] = (total[index] ?? 0) + value;
    }
  }

  return total;
};

export interface Layer {
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
}

export const rest = "rest";

export const stackOf = (named: readonly Layer[], total: readonly number[]): readonly Layer[] => {
  const others = total.map((value, index) =>
    Math.max(
      0,
      named.reduce((left, layer) => left - (layer.values[index] ?? 0), value),
    ),
  );

  return others.some((value) => value > 1e-9)
    ? [...named, { key: rest, label: "Everything else", values: others }]
    : named;
};

export type Reading = "read" | "missing" | null;

export const readingsOf = (
  scored: readonly number[],
  spend: readonly number[],
): readonly Reading[] =>
  spend.map((paid, index) => {
    if ((scored[index] ?? 0) > 0) {
      return "read";
    }

    return paid > 0 ? "missing" : null;
  });

export const gapsOf = (readings: readonly Reading[]) => {
  const gaps: { from: number; to: number }[] = [];
  let open: { from: number; to: number } | null = null;

  for (const [index, reading] of readings.entries()) {
    if (reading === "read") {
      open = null;
    } else if (reading === "missing") {
      if (open === null) {
        open = { from: index, to: index + 1 };
        gaps.push(open);
      } else {
        open.to = index + 1;
      }
    }
  }

  return gaps;
};

export interface Coverage {
  readonly read: readonly string[];
  readonly active: number;
  readonly share: number;
  readonly missing: number;
}

const slotLabels = {
  "1d": (at: number, zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      timeZone: zone,
    }).format(at),
  "1h": (at: number, zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      timeZone: zone,
    }).format(at),
  "1w": (at: number, zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "short",
      timeZone: zone,
    }).format(at),
} as const;

export const coverageOf = (
  readings: readonly Reading[],
  spend: readonly number[],
  buckets: readonly { readonly at: number }[],
  size: BucketSize,
  cells: readonly Cell[],
  zone: string,
): Coverage => {
  const slots =
    size === "4h"
      ? cells.map((cell) => ({
          from: cell.from,
          label: cell.now === null ? cell.label : "today",
          to: cell.to,
        }))
      : buckets.map((bucket, index) => ({
          from: index,
          label: slotLabels[size](bucket.at, zone),
          to: index + 1,
        }));

  const read: string[] = [];
  let active = 0;
  let covered = 0;
  let paid = 0;

  for (const slot of slots) {
    const inside = new Set(readings.slice(slot.from, slot.to));
    const cost = spend.slice(slot.from, slot.to).reduce((a, b) => a + b, 0);

    if (inside.has("read")) {
      read.push(slot.label);
      active += 1;
      covered += cost;
    } else if (inside.has("missing")) {
      active += 1;
    }

    paid += cost;
  }

  return {
    active,
    missing: paid - covered,
    read,
    share: paid > 0 ? covered / paid : 0,
  };
};

export const bucketLabel = (at: number, size: BucketSize, zone: string) => {
  if (size === "1w") {
    return `Week of ${slotLabels["1w"](at, zone)}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    ...(size === "1d" ? { day: "numeric", month: "short" } : { hour: "numeric" }),
    timeZone: zone,
    weekday: "short",
  }).format(at);
};

const placeOf = (project: string) =>
  project
    .replace(/^local:/u, "")
    .replace(/^github\.com\//u, "")
    .replace(/^\/(?:home|Users)\/[^/]+/u, "~");

export const labelsOf = (
  rows: readonly { readonly key: string; readonly label: string }[],
): ReadonlyMap<string, string> => {
  const named = rows.map((row) => ({
    key: row.key,
    label: /^t:telegram:-\d+$/u.test(row.key) ? "General" : row.label,
  }));

  const counts = new Map<string, number>();

  for (const row of named) {
    counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
  }

  return new Map(
    named.map((row) => [
      row.key,
      (counts.get(row.label) ?? 0) > 1 && row.key.startsWith("p:")
        ? placeOf(row.key.slice(2))
        : row.label,
    ]),
  );
};

export const totalOf = (
  rows: readonly {
    readonly values: Values;
    readonly sessions: number;
    readonly series: readonly number[];
  }[],
) => {
  const sum = (unit: Unit) => {
    let total: number | null = null;

    for (const row of rows) {
      const value = row.values[unit];

      if (value !== null) {
        total = (total ?? 0) + value;
      }
    }

    return total;
  };

  return {
    series: sumSeries(rows.map((row) => row.series)),
    sessions: rows.reduce((count, row) => count + row.sessions, 0),
    values: {
      api: sum("api"),
      fiveHour: sum("fiveHour"),
      plan: sum("plan"),
      tokens: sum("tokens"),
      week: sum("week"),
    },
  };
};
