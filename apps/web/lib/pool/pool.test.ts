import { describe, expect, test } from "bun:test";

import { activity, busiest, gaps } from "@/lib/pool/activity";
import { HOUR, WEEK, compact, lastDrop, lockedSpans, usedBetween } from "@/lib/pool/history";
import type { Points } from "@/lib/pool/history";
import { namesOf } from "@/lib/pool/names";
import { windowPace } from "@/lib/pool/pace";
import { logins, plansOf, poolOf, workingOn } from "@/lib/pool/pool";
import { windows } from "@/lib/pool/timeline";
import { weeksOf, withHistory } from "@/lib/pool/weeks";
import type { Outlook } from "@/lib/pool/weeks";
import type { Account, Grant, LiveSession } from "@/lib/proxy/schema";
import { duration } from "@/lib/time/format";
import { timeIn } from "@/lib/time/zone";

const pacific = timeIn("America/Los_Angeles");
const { when } = pacific;

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
      ]),
    ).toBe(3);
    expect(
      lastDrop([
        [0, 99],
        [1, 98],
      ]),
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

const ramp = (from: number, to: number, perHour: number, base = 0): Points =>
  Array.from({ length: (to - from) * 10 + 1 }, (_, index) => {
    const hours = from + index / 10;

    return [at(hours), Math.floor(base + (hours - from) * perHour)] as const;
  });

describe("windowPace", () => {
  test("even spending reads 1x", () => {
    const pace = windowPace(window(50), ramp(0, 84, 50 / 84), at(84));

    expect(pace?.pace).toBeCloseTo(1);
    expect(pace?.even).toBeCloseTo(50);
    expect(Math.abs((pace?.runsOut ?? 0) - at(84 + 48 * (84 / 50)))).toBeLessThan(2 * HOUR);
  });

  test("ahead of pace runs out before reset", () => {
    const pace = windowPace(window(50), ramp(0, 42, 50 / 42), at(42));

    expect(pace?.pace).toBeCloseTo(2);
    expect(Math.abs((pace?.runsOut ?? 0) - at(42 + 48 * (42 / 50)))).toBeLessThan(2 * HOUR);
    expect(pace?.atReset).toBe(100);
  });

  test("a locked plan reports when it ran out, not a pace", () => {
    const points: Points = [
      [at(0), 0],
      [at(56), 98],
      [at(60), 100],
    ];

    const pace = windowPace(window(100), points, at(80));

    expect(pace?.locked).toBe(true);
    expect(pace?.ranOut).toBe(at(56));
    expect(pace?.pace).toBeNull();
    expect(pace?.runsOut).toBeNull();
    expect(pace?.rate).toBeCloseTo(98 / (56 * HOUR));
  });

  test("a plan change restarts the window the pace and the chart count from", () => {
    const points: Points = [[at(0), 0], [at(10), 8], [at(12), 0], ...ramp(12, 24, 2 / 12)];

    const pace = windowPace(window(2), points, at(24));

    expect(pace?.start).toBe(at(12));
    expect(pace?.restarted).toBe(true);
    expect(pace?.even).toBeCloseTo((12 * 100) / 156);
    expect(pace?.pace).toBeCloseTo(2 / ((12 * 100) / 156));
  });

  test("a reading that hasn't ticked yet doesn't move the run-out", () => {
    const points = ramp(0, 2, 6, 0).filter(([time]) => time <= at(2));

    const runOuts = [0, 3, 6, 9].map((minutes) => {
      const now = at(2) + minutes * 60_000;

      return windowPace({ ...window(12), sampledAt: now }, points, now)?.runsOut;
    });

    const spread = Math.max(...runOuts.map(Number)) - Math.min(...runOuts.map(Number));

    expect(spread).toBeLessThan(15 * 60_000);
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
    expect(
      namesOf(
        [
          { id: "1", label: "a@x.com" },
          { id: "2", label: "b@y.com" },
          { id: "3", label: "b@z.com" },
        ],
        [],
      ),
    ).toEqual({ "1": "a", "2": "b@y.com", "3": "b@z.com", none: "No account" });
  });

  test("an API key folds into the login that owns its credit", () => {
    const result = logins(
      [account("plan", "me@x.com"), account("key", "", "")],
      [grant("key", "plan")],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("me");
    expect(result[0]?.grants).toHaveLength(1);
  });
});

const reading = (id: string, used: number | null): Account => ({
  ...account(id, `${id}@x.com`),
  fiveHour: window(used),
});

describe("session pool", () => {
  test("a plan with no reading stays out of the sum and the total", () => {
    const plans = plansOf(
      {
        a: reading("a", 8),
        b: reading("b", null),
        c: reading("c", null),
      },
      [],
      {},
      resetsAt,
    );

    const { session } = poolOf(plans);

    expect(session.total).toBe(100);
    expect(session.left).toBe(92);
    expect(session.parts).toHaveLength(1);
  });

  test("a locked plan counts as nothing left", () => {
    const plans = plansOf(
      { a: reading("a", 8), b: { ...reading("b", 100), standing: "limited" } },
      [],
      {},
      resetsAt,
    );

    const { session } = poolOf(plans);

    expect(session.total).toBe(200);
    expect(session.left).toBe(92);
  });

  test("a plan with no weekly reading stays out of the weekly total", () => {
    const plans = plansOf(
      { a: { ...reading("a", 8), week: window(30) }, b: reading("b", 8) },
      [],
      {},
      resetsAt,
    );

    const { week } = poolOf(plans);

    expect(week.total).toBe(100);
    expect(week.left).toBe(70);
  });

  test("no readings at all leaves no parts", () => {
    const { session, week } = poolOf(plansOf({ a: reading("a", null) }, [], {}, resetsAt));

    expect(session.parts).toHaveLength(0);
    expect(week.parts).toHaveLength(0);
  });
});

const live = (id: string, owner: string | null, state: LiveSession["state"]): LiveSession => ({
  account: owner,
  app: null,
  cwd: "/",
  entrypoint: "cli",
  host: "h",
  id,
  label: id,
  row: id,
  since: 0,
  state,
});

describe("workingOn", () => {
  test("counts only working sessions, per account", () => {
    const counts = workingOn({
      a: live("a", "x", "working"),
      b: live("b", "x", "idle"),
      c: live("c", "y", "working"),
      d: live("d", "x", "working"),
    });

    expect(counts.get("x")?.length).toBe(2);
    expect(counts.get("y")?.length).toBe(1);
  });
});

describe("format", () => {
  test("duration reads like Headroom", () => {
    expect(duration(3 * HOUR + 38 * 60_000)).toBe("3 h 38 min");
    expect(duration(5 * 24 * HOUR + 11 * HOUR)).toBe("5 days 11 h");
    expect(duration(30_000)).toBe("<1 min");
  });

  test("duration carries instead of printing 60 min or 24 h", () => {
    expect(duration(HOUR - 10_000)).toBe("1 h");
    expect(duration(26 * 24 * HOUR + 23.7 * HOUR)).toBe("27 days");
  });

  test("when names the day once it isn't today, and the date past six days", () => {
    const now = pacific.instant(2026, 10, 5, 7, 20);

    expect(when(pacific.instant(2026, 10, 5, 20, 13), now)).toBe("8:13 PM");
    expect(when(pacific.instant(2026, 10, 7, 18), now)).toBe("Sat 6 PM");
    expect(when(pacific.instant(2026, 10, 7, 17, 59, 59), now)).toBe("Sat 6 PM");
    expect(when(pacific.instant(2026, 10, 11, 18), now)).toBe("Nov 11");
  });
});

describe("activity", () => {
  test("hours with every plan locked become one gap", () => {
    const now = pacific.instant(2026, 10, 5, 12);
    const dayStart = pacific.instant(2026, 10, 5);

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

    const days = activity(plans, now, pacific, 1);

    expect(gaps(days)).toEqual([{ from: dayStart + 3 * HOUR, to: dayStart + 6 * HOUR }]);
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

const novemberDay = (date: number, hour = 0) => pacific.instant(2026, 10, date, hour);

const outlook = (overrides: Partial<Outlook>): Outlook => ({
  cutoff: 98,
  locks: [],
  rate: 0,
  resetsAt: null,
  room: 0,
  since: null,
  ...overrides,
});

describe("weeks", () => {
  const since = pacific.instant(2026, 9, 17);
  const now = pacific.instant(2026, 10, 5, 12);

  const daily = {
    days: [
      [pacific.instant(2026, 9, 17), 10],
      [pacific.instant(2026, 9, 20), 30],
      [pacific.instant(2026, 10, 3), 20],
    ] as const,
    id: "a",
  };

  test("weeks split Monday to Sunday, the first one partial", () => {
    const result = weeksOf(
      daily,
      since,
      now,
      outlook({ rate: 20 / 7 / (24 * HOUR), room: 5 }),
      pacific,
    );

    expect(result.weeks).toHaveLength(4);
    expect(result.weeks[0]?.part).toBe(true);
    expect(result.weeks[0]?.days[3]?.used).toBeNull();
    expect(result.base).toBe(30);
    expect(result.weeks[3]?.current).toBe(true);
    expect(result.weeks[3]?.expected).toBeCloseTo(25);
  });

  test("the forecast starts now, so today's run-out lands on today", () => {
    const week = weeksOf(
      daily,
      since,
      now,
      outlook({ rate: 10 / (24 * HOUR), room: 3 }),
      pacific,
    ).weeks.at(-1);

    expect(week?.days[3]?.forecast).toBeCloseTo(3);
    expect(week?.days[3]?.out).toBe("forecast");
    expect(week?.days[4]?.lock).toBe("forecast");
  });

  test("room comes back at the reset", () => {
    const week = weeksOf(
      daily,
      since,
      now,
      outlook({
        locks: [[pacific.instant(2026, 10, 3, 10), pacific.instant(2026, 10, 7, 18)]],
        rate: 10 / (24 * HOUR),
        resetsAt: pacific.instant(2026, 10, 7, 18),
      }),
      pacific,
    ).weeks.at(-1);

    expect(week?.expected).toBeCloseTo(20 + 2.5 + 10);
    expect(week?.days[1]?.out).toBe("real");
    expect(week?.days[5]?.lock).toBe("real");
    expect(week?.days[6]?.lock).toBeNull();
  });

  test("days before the account existed stay empty", () => {
    const week = weeksOf(
      { days: [[pacific.instant(2026, 10, 2), 0.002]], id: "a" },
      since,
      now,
      outlook({ since: pacific.instant(2026, 10, 4, 22) }),
      pacific,
    ).weeks.at(-1);

    expect(week?.days[0]?.used).toBeNull();
    expect(week?.days[2]?.used).toBe(0);
  });

  test("limit history replaces the usage estimate for the days it covers", () => {
    const merged = withHistory(
      {
        days: [
          [novemberDay(1), 4],
          [novemberDay(3), 1],
        ],
        id: "a",
      },
      [
        [novemberDay(2, 12), 0],
        [novemberDay(3, 9), 60],
        [novemberDay(3, 20), 99],
      ],
      novemberDay(3, 21),
      pacific,
    );

    expect(merged.days).toEqual([
      [novemberDay(1), 4],
      [novemberDay(3), 99],
    ]);
  });
});
