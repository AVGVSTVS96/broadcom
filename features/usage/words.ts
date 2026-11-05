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
  ["tokens", "Tokens"],
  ["api", "API $"],
  ["plan", "Plan $"],
  ["fiveHour", "5 h"],
  ["week", "Week"],
] as const satisfies readonly (readonly [Unit, string])[];

export const unitLabels = {
  api: "API $",
  fiveHour: "5-hour limit",
  plan: "Plan $",
  tokens: "Tokens",
  week: "Week limit",
} as const satisfies Record<Unit, string>;

export const unitName = (unit: Unit) => unitLabels[unit];

export const unitNotes = {
  api: "API $ is what the same requests cost at API prices.",
  fiveHour:
    "Points of a five-hour limit, summed over accounts. Agent SDK requests count {factor}×.",
  plan: "Plan $ is each request's share of its plan's monthly fee.",
  tokens: "Tokens include cache reads.",
  week: "Points of a weekly limit, summed over accounts. 100% is one account's whole week.",
} as const satisfies Record<Unit, string>;

export const groupNames = [
  ["agent", "Agents"],
  ["session", "Sessions"],
  ["project", "Projects"],
  ["model", "Models"],
  ["account", "Accounts"],
] as const satisfies readonly (readonly [Grouping, string])[];

export const groupPlural = (by: Grouping) =>
  (groupNames.find(([option]) => option === by)?.[1] ?? by).toLowerCase();

export const bucketWords = {
  "1d": "day",
  "1h": "hour",
  "1w": "week",
  "4h": "4 hours",
} as const satisfies Record<BucketSize, string>;

export const cellWords = {
  "1d": "week",
  "1h": "6 hours",
  "1w": "month",
  "4h": "day",
} as const satisfies Record<BucketSize, string>;

export const presets = [
  ["microscope", { q: "microscope", "w.app": null }],
  ["autofork", { q: "autofork", "w.app": null }],
  ["GitHub Actions", { q: null, "w.app": "actions" }],
] as const;
