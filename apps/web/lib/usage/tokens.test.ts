import { describe, expect, test } from "bun:test";

import type { TokensView } from "@/lib/proxy/schema";
import { modelLabel, tokenStats, utcOfDay } from "@/lib/usage/tokens";

const day = (text: string, tokens: number) => ({
  cacheRead: tokens * 0.9,
  cacheWrite: 0,
  day: text,
  input: tokens * 0.1,
  output: 0,
  tokens,
});

const view: TokensView = {
  at: 0,
  days: [
    day("2026-10-01", 50),
    day("2026-11-05", 400),
    day("2026-11-07", 100),
    day("2026-11-08", 200),
    day("2026-11-09", 300),
  ],
  last30d: 1000,
  last7d: 990,
  models: [
    { model: "claude-opus-5-5", tokens: 700 },
    { model: "gpt-6.1-sol", tokens: 200 },
    { model: "claude-haiku-5-5", tokens: 80 },
    { model: "claude-fable-5", tokens: 60 },
    { model: "gpt-5.5", tokens: 10 },
  ],
  timezone: "America/Los_Angeles",
};

const noonSunday = Date.parse("2026-11-09T20:00:00Z");

describe("token stats", () => {
  const stats = tokenStats(view, noonSunday, 6);

  test("sums days, windows and the best day", () => {
    expect(stats.total).toBe(1050);
    expect(stats.today).toBe(300);
    expect(stats.week).toBe(990);
    expect(stats.month).toBe(1000);
    expect(stats.best).toEqual({ day: Date.parse("2026-11-05") / 86_400_000, tokens: 400 });
    expect(stats.since).toBe(utcOfDay(Date.parse("2026-10-01") / 86_400_000));
    expect(stats.cacheShare).toBeCloseTo(0.9);
  });

  test("counts the streak back from today", () => {
    expect(stats.streak).toBe(3);
  });

  test("lays weeks out Sunday first and ends on today's week", () => {
    expect(stats.weeks).toHaveLength(6);
    const last = stats.weeks.at(-1) ?? [];
    expect(last[0]?.day).toBe(Date.parse("2026-11-08") / 86_400_000);
    expect(last[1]?.tokens).toBe(300);
    expect(last[2]?.future).toBe(true);
    expect(last[1]?.level).toBeGreaterThan(last[0]?.level ?? 0);
  });

  test("keeps the top three models and folds the rest", () => {
    expect(stats.models.map((model) => model.label)).toEqual([
      "Opus 5.5",
      "GPT-6.1 Sol",
      "Haiku 5.5",
      "Everything else",
    ]);
    expect(stats.models.at(-1)?.tokens).toBe(70);
  });
});

describe("model labels", () => {
  test.each([
    ["claude-opus-5-5", "Opus 5.5"],
    ["claude-sonnet-4-5-20250929", "Sonnet 4.5"],
    ["gpt-5.5", "GPT-5.5"],
    ["gpt-6-astra", "GPT-6 Astra"],
    ["gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview"],
    ["faux-1", "Faux 1"],
  ])("%s reads %s", (model, label) => {
    expect(modelLabel(model)).toBe(label);
  });
});
