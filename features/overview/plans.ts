import type { Tone } from "@/components/viz/meter";
import { HOUR } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import { windowPace } from "@/lib/model/pace";
import type { Pace } from "@/lib/model/pace";
import { logins } from "@/lib/model/pool";
import type { Login } from "@/lib/model/pool";
import type { Account, Grant, LimitWindow } from "@/lib/proxy/schema";

export interface Plan extends Login {
  readonly pace: Pace | null;
}

export const plansOf = (
  accounts: Readonly<Record<string, Account>>,
  grants: readonly Grant[],
  history: Readonly<Record<string, Points>>,
  now: number
): readonly Plan[] =>
  logins(Object.values(accounts), grants).map((login) => ({
    ...login,
    pace: login.hasPlan
      ? windowPace(login.account.week, history[login.id] ?? [], now)
      : null,
  }));

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

export const byPace = (plans: readonly Plan[]) =>
  plans
    .filter((plan) => plan.pace !== null)
    .toSorted((a, b) => (b.pace?.pace ?? 0) - (a.pace?.pace ?? 0));
