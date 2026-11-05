import { describe, expect, test } from "bun:test";

import { activity, busiest, gaps } from "@/lib/model/activity";
import { duration } from "@/lib/model/format";
import {
  HOUR,
  WEEK,
  compact,
  lastDrop,
  lockedSpans,
  usedBetween,
} from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import { windowPace } from "@/lib/model/pace";
import { logins, names } from "@/lib/model/pool";
import { windows } from "@/lib/model/timeline";
import { weeksOf } from "@/lib/model/weeks";
import type { Account, Grant } from "@/lib/proxy/schema";

const resetsAt = Date.UTC(2026, 10, 8, 2);
const start = resetsAt - WEEK;
const at = (hours: number) => start + hours * HOUR;

const window = (used: number | null) => ({
  cutoff: 98,
  elapsed: null,
  resetsAt,
  sampledAt: null,
  used,
});

describe("history", () => {
  test("compact keeps the ends of every flat run", () => {
    const points: Points = [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 5],
      [5, 5],
      [6, 5],
    ];

    expect(compact(points)).toEqual([
      [1, 0],
      [3, 0],
      [4, 5],
      [6, 5],
    ]);
  });

  test("usedBetween ignores rounding jitter and counts again after a reset", () => {
    const points: Points = [
      [0, 10],
      [1, 20],
      [2, 19],
      [3, 20],
      [4, 1],
      [5, 6],
    ];

    expect(usedBetween(points, 0, 10)).toBe(15);
    expect(usedBetween(points, 4, 10)).toBe(5);
  });

  test("lastDrop finds a reset, not a one-point wobble", () => {
    expect(
      lastDrop([
        [0, 99],
        [1, 98],
        [2, 100],
        [3, 2],
      ])
    ).toBe(3);
    expect(
      lastDrop([
        [0, 99],
        [1, 98],
      ])
    ).toBeNull();
  });

  test("a lock lasts from the cutoff to the next reset", () => {
    const points: Points = [
      [0, 50],
      [1, 98],
      [2, 97],
      [3, 100],
      [4, 0],
      [5, 99],
    ];

    expect(lockedSpans(points, 98, 9)).toEqual([
      [1, 4],
      [5, 9],
    ]);
  });
});

describe("windowPace", () => {
  test("even spending reads 1x", () => {
    const points: Points = [
      [at(0), 0],
      [at(84), 50],
    ];

    const pace = windowPace(window(50), points, at(84));

    expect(pace?.pace).toBeCloseTo(1);
    expect(pace?.even).toBeCloseTo(50);
    expect(pace?.runsOut).toBeCloseTo(at(84 + 48 * (84 / 50)));
  });

  test("ahead of pace runs out before reset", () => {
    const points: Points = [
      [at(0), 0],
      [at(42), 50],
    ];

    const pace = windowPace(window(50), points, at(42));

    expect(pace?.pace).toBeCloseTo(2);
    expect(pace?.runsOut).toBeCloseTo(at(42 + 48 * (42 / 50)));
    expect(pace?.atReset).toBe(100);
  });

  test("a locked plan reports when it ran out and its pace until then", () => {
    const points: Points = [
      [at(0), 0],
      [at(56), 98],
      [at(60), 100],
    ];

    const pace = windowPace(window(100), points, at(80));

    expect(pace?.locked).toBe(true);
    expect(pace?.ranOut).toBe(at(56));
    expect(pace?.pace).toBeCloseTo(3 * (98 / 100));
    expect(pace?.runsOut).toBeNull();
  });

  test("pace counts only what came after a plan change", () => {
    const points: Points = [
      [at(0), 0],
      [at(10), 8],
      [at(12), 0],
      [at(24), 2],
    ];

    const pace = windowPace(window(2), points, at(24));

    expect(pace?.line[0]).toEqual([at(12), 0]);
    expect(pace?.pace).toBeCloseTo(2 / 12 / (100 / 168));
  });

  test("no reading means no pace", () => {
    expect(windowPace(window(null), [], at(1))).toBeNull();
  });
});

const account = (id: string, label: string, plan = "Max 20x"): Account => ({
  atLimit: null,
  cloud: null,
  fiveHour: window(null),
  heldResets: [],
  id,
  idle: 0,
  label,
  plan,
  rank: null,
  reasons: [],
  signInUntil: null,
  since: null,
  standing: "open",
  week: window(null),
  working: 0,
});

const grant = (credentialId: string, owner: string): Grant => ({
  account: owner,
  allowance: 200,
  credentialId,
  expiresAt: 0,
  lastRequestAt: null,
  monthlyCap: 200,
  observedAt: 0,
  organization: "",
  proxyUsd: 0,
  recorded: 0,
  remaining: 12,
  renewsAt: 0,
  requests: 0,
  startsAt: 0,
  unpriced: 0,
});

describe("pool", () => {
  test("names shorten to the local part unless two would clash", () => {
    expect(names(["a@x.com", "b@y.com", "b@z.com"])).toEqual([
      "a",
      "b@y.com",
      "b@z.com",
    ]);
  });

  test("an API key folds into the login that owns its credit", () => {
    const result = logins(
      [account("plan", "me@x.com"), account("key", "", "")],
      [grant("key", "plan")]
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("me");
    expect(result[0]?.grants).toHaveLength(1);
  });
});

describe("format", () => {
  test("duration reads like Headroom", () => {
    expect(duration(3 * HOUR + 38 * 60_000)).toBe("3 h 38 min");
    expect(duration(5 * 24 * HOUR + 11 * HOUR)).toBe("5 days 11 h");
    expect(duration(30_000)).toBe("<1 min");
  });
});

describe("activity", () => {
  test("hours with every plan locked become one gap", () => {
    const now = new Date(2026, 10, 5, 12).getTime();
    const dayStart = new Date(2026, 10, 5).getTime();

    const plans: { cutoff: number; id: string; points: Points }[] = [
      {
        cutoff: 98,
        id: "a",
        points: [
          [dayStart - HOUR, 0],
          [dayStart + 2 * HOUR, 98],
          [dayStart + 6 * HOUR, 0],
        ],
      },
      {
        cutoff: 98,
        id: "b",
        points: [
          [dayStart - HOUR, 0],
          [dayStart + 3 * HOUR, 99],
        ],
      },
    ];

    const days = activity(plans, now, 1);

    expect(gaps(days)).toEqual([
      { from: dayStart + 3 * HOUR, to: dayStart + 6 * HOUR },
    ]);
    expect(days[0]?.hours[2]?.runOuts).toEqual(["a"]);
    expect(days[0]?.locked).toBe(2);
    expect(busiest(days).start).toBe(1);
  });
});

describe("windows", () => {
  test("an ended window shows only when history reaches before it", () => {
    expect(windows(resetsAt, [[at(1), 3]]).ended).toBeNull();
    expect(windows(resetsAt, [[at(-5), 80]]).ended?.used).toBe(80);
  });
});

describe("weeks", () => {
  test("weeks split Monday to Sunday, the first one partial", () => {
    const since = new Date(2026, 9, 17).getTime();
    const now = new Date(2026, 10, 5, 12).getTime();

    const days = [
      [new Date(2026, 9, 17).getTime(), 10],
      [new Date(2026, 9, 20).getTime(), 30],
      [new Date(2026, 10, 3).getTime(), 20],
    ] as const;

    const result = weeksOf({ days, id: "a" }, since, now);

    expect(result.weeks).toHaveLength(4);
    expect(result.weeks[0]?.part).toBe(true);
    expect(result.weeks[0]?.days.slice(0, 4)).toEqual([null, null, null, null]);
    expect(result.base).toBe(30);
    expect(result.weeks[3]?.current).toBe(true);
    expect(result.weeks[3]?.forecast).toBeCloseTo((20 / 4) * 7);
  });
});
