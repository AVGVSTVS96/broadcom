import type { TokensView } from "@/lib/proxy/schema";

const DAY = 86_400_000;

const dayOf = (text: string) => Date.parse(`${text}T00:00:00Z`) / DAY;

const isoDay = new Map<string, Intl.DateTimeFormat>();

export const todayIn = (timezone: string, now: number) => {
  const formatter =
    isoDay.get(timezone) ??
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: timezone,
      year: "numeric",
    });

  isoDay.set(timezone, formatter);

  return dayOf(formatter.format(now));
};

export const utcOfDay = (day: number) => day * DAY;

export type Level = 0 | 1 | 2 | 3 | 4;

export interface HeatDay {
  readonly day: number;
  readonly tokens: number;
  readonly level: Level;
  readonly future: boolean;
}

export interface ModelShare {
  readonly key: string;
  readonly label: string;
  readonly tokens: number;
  readonly share: number;
}

export interface TokenStats {
  readonly total: number;
  readonly since: number | null;
  readonly today: number;
  readonly week: number;
  readonly month: number;
  readonly best: { readonly day: number; readonly tokens: number } | null;
  readonly streak: number;
  readonly cacheShare: number | null;
  readonly weeks: readonly (readonly HeatDay[])[];
  readonly models: readonly ModelShare[];
}

const title = (word: string) =>
  word === "gpt" ? "GPT" : `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

const isNumber = (part: string) => /^\d+(?:\.\d+)?$/u.test(part);

export const modelLabel = (model: string) => {
  const parts = model
    .replace(/^claude-/u, "")
    .split("-")
    .filter((part) => !/^\d{8}$/u.test(part));

  const version = parts.findIndex((part) => /^\d/u.test(part));

  if (version === -1) {
    return parts.map(title).join(" ");
  }

  const name = parts.slice(0, version).map(title).join(" ");
  const tail = parts.slice(version);
  const count = tail.slice(0, 2).every(isNumber) ? Math.min(2, tail.length) : 1;
  const number = tail.slice(0, count).join(".");
  const after = tail.slice(count).map(title);

  if (name === "GPT") {
    return [`GPT-${number}`, ...after].join(" ");
  }

  return [name, number, ...after].filter((part) => part !== "").join(" ");
};

const sum = (values: readonly number[]) => {
  let total = 0;

  for (const value of values) {
    total += value;
  }

  return total;
};

const quantile = (sorted: readonly number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

const shown = 4;

export const tokenStats = (view: TokensView, now: number, weekCount = 53): TokenStats => {
  const today = todayIn(view.timezone, now);
  const byDay = new Map(view.days.map((entry) => [dayOf(entry.day), entry.tokens]));
  const tokensOn = (day: number) => byDay.get(day) ?? 0;

  const sumSince = (days: number) =>
    sum(view.days.filter((entry) => dayOf(entry.day) > today - days).map((entry) => entry.tokens));

  const total = sum(view.days.map((entry) => entry.tokens));
  const cache = sum(view.days.map((entry) => entry.cacheRead));

  let best: TokenStats["best"] = null;

  for (const entry of view.days) {
    if (best === null || entry.tokens > best.tokens) {
      best = { day: dayOf(entry.day), tokens: entry.tokens };
    }
  }

  let streak = 0;

  for (let day = tokensOn(today) > 0 ? today : today - 1; tokensOn(day) > 0; day -= 1) {
    streak += 1;
  }

  const first = today - ((today + 4) % 7) - (weekCount - 1) * 7;
  const window = Array.from({ length: weekCount * 7 }, (_, index) => first + index);

  const nonzero = window
    .map(tokensOn)
    .filter((tokens) => tokens > 0)
    .toSorted((a, b) => a - b);

  const cuts = [0.25, 0.5, 0.75].map((q) => quantile(nonzero, q));

  const levelOf = (tokens: number): Level => {
    if (tokens <= 0) {
      return 0;
    }

    const above = cuts.filter((cut) => tokens > cut).length;

    return ([1, 2, 3, 4] as const)[above] ?? 4;
  };

  const weeks = Array.from({ length: weekCount }, (_, week) =>
    window.slice(week * 7, week * 7 + 7).map((day) => ({
      day,
      future: day > today,
      level: levelOf(tokensOn(day)),
      tokens: tokensOn(day),
    })),
  );

  const modelTotal = sum(view.models.map((model) => model.tokens));
  const rest = sum(view.models.slice(shown).map((model) => model.tokens));
  const share = (tokens: number) => (modelTotal > 0 ? tokens / modelTotal : 0);

  const models = view.models.slice(0, shown).map((model) => ({
    key: model.model,
    label: modelLabel(model.model),
    share: share(model.tokens),
    tokens: model.tokens,
  }));

  if (rest > 0) {
    models.push({ key: "rest", label: "Everything else", share: share(rest), tokens: rest });
  }

  return {
    best,
    cacheShare: total > 0 ? cache / total : null,
    models,
    month: sumSince(30),
    since: view.days[0] === undefined ? null : utcOfDay(dayOf(view.days[0].day)),
    streak,
    today: tokensOn(today),
    total,
    week: sumSince(7),
    weeks,
  };
};
