import type { Pace } from "@/lib/model/pace";
import type { LimitWindow } from "@/lib/proxy/schema";

export type Tone = "ok" | "over" | "bad" | "none";

export const emptyCredit = 1;

const lowCredit = 0.1;

export const windowTone = (window: LimitWindow, pace: Pace | null = null): Tone => {
  if (window.used === null) {
    return "none";
  }

  if (window.used >= window.cutoff) {
    return "bad";
  }

  if (pace !== null) {
    return pace.runsOut === null ? "ok" : "over";
  }

  const elapsed = window.elapsed ?? 0;

  return elapsed > 0 && window.used / elapsed >= window.cutoff ? "over" : "ok";
};

export const creditTone = (remaining: number, allowance: number): Tone => {
  if (remaining < emptyCredit) {
    return "bad";
  }

  return remaining < allowance * lowCredit ? "over" : "ok";
};

const best = ["ok", "over", "bad", "none"] as const satisfies readonly Tone[];

export const poolTone = (tones: readonly Tone[]): Tone =>
  best.find((tone) => tones.includes(tone)) ?? "none";
