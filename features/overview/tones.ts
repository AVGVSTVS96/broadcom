import type { Tone } from "@/components/viz/meter";
import { HOUR } from "@/lib/model/history";
import type { Pace } from "@/lib/model/pace";
import type { LimitWindow } from "@/lib/proxy/schema";

const sessionLength = 5 * HOUR;

export const sessionTone = (window: LimitWindow, now: number): Tone => {
  if (window.used === null || window.resetsAt === null) {
    return "ok";
  }

  if (window.used >= window.cutoff) {
    return "bad";
  }

  const elapsed = (now - (window.resetsAt - sessionLength)) / sessionLength;

  return window.used > elapsed * 100 ? "over" : "ok";
};

export const weekTone = (pace: Pace | null): Tone => {
  if (pace === null) {
    return "ok";
  }

  if (pace.locked) {
    return "bad";
  }

  return pace.used > pace.even ? "over" : "ok";
};
