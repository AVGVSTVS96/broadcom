import type { BucketSize, UsageAmount, UsagePoints } from "@/lib/proxy/schema";

export const ranges = ["today", "7d", "30d", "6m"] as const;

export type Range = (typeof ranges)[number];

export const units = ["tokens", "api", "plan", "fiveHour", "week"] as const;

export type Unit = (typeof units)[number];

export const groupings = [
  "agent",
  "session",
  "project",
  "model",
  "account",
] as const;

export type Grouping = (typeof groupings)[number];

export const oneOf = <T extends string>(
  options: readonly T[],
  value: string | null | undefined,
  fallback: T
): T => options.find((option) => option === value) ?? fallback;

export type Values = Readonly<Record<Unit, number | null>>;

export const valuesOf = (amount: UsageAmount, points: UsagePoints): Values => ({
  api: amount.apiUsd,
  fiveHour: points.fiveHour,
  plan: amount.planUsd,
  tokens: amount.tokens,
  week: points.week,
});

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

  return value >= 10 || value === 0
    ? String(Math.round(value))
    : value.toFixed(1);
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
    const read = Object.fromEntries(
      parts.formatToParts(at).map((part) => [part.type, part.value])
    );

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
  now: number
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

export const sumCells = (
  series: readonly number[],
  cells: readonly Cell[]
): readonly number[] =>
  cells.map((cell) =>
    series.slice(cell.from, cell.to).reduce((sum, value) => sum + value, 0)
  );

export const sumSeries = (lists: readonly (readonly number[])[]) => {
  const total: number[] = [];

  for (const list of lists) {
    for (const [index, value] of list.entries()) {
      total[index] = (total[index] ?? 0) + value;
    }
  }

  return total;
};
