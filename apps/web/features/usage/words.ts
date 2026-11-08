import type { Grouping, Range, Unit } from "@/lib/model/usage";
import type { BucketSize } from "@/lib/proxy/schema";

export const rangeNames = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["6m", "6 months"],
] as const satisfies readonly (readonly [Range, string])[];

export const rangeWords = {
  "30d": "in 30 days",
  "6m": "in 6 months",
  "7d": "in 7 days",
  today: "today",
} as const satisfies Record<Range, string>;

export const previousWords = {
  "30d": "the 30 days before",
  "6m": "the 6 months before",
  "7d": "the 7 days before",
  today: "yesterday",
} as const satisfies Record<Range, string>;

export const unitNames = [
  ["api", "API $"],
  ["plan", "Plan $"],
  ["tokens", "Tokens"],
  ["fiveHour", "5-hour"],
  ["week", "Weekly"],
] as const satisfies readonly (readonly [Unit, string])[];

export const unitName = (unit: Unit) =>
  unitNames.find(([option]) => option === unit)?.[1] ?? unit;

export const groupNames = [
  ["agent", "Agents"],
  ["session", "Sessions"],
  ["project", "Projects"],
  ["model", "Models"],
  ["account", "Accounts"],
] as const satisfies readonly (readonly [Grouping, string])[];

export const groupName = (by: Grouping) =>
  groupNames.find(([option]) => option === by)?.[1] ?? by;

export const groupPlural = (by: Grouping) => groupName(by).toLowerCase();

export const bucketWords = {
  "1d": "day",
  "1h": "hour",
  "1w": "week",
  "4h": "4 hours",
} as const satisfies Record<BucketSize, string>;

export const slotWords = {
  "1d": "day",
  "1h": "hour",
  "1w": "week",
  "4h": "day",
} as const satisfies Record<BucketSize, string>;

export const presets = [
  ["microscope", { q: "microscope", "w.app": null }],
  ["autofork", { q: "autofork", "w.app": null }],
  ["GitHub Actions", { q: null, "w.app": "actions" }],
] as const;

export const listOf = (items: readonly string[]) =>
  new Intl.ListFormat("en", { type: "conjunction" }).format(items);
