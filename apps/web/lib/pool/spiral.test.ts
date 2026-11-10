import { describe, expect, test } from "bun:test";

import { DAY, HOUR, WEEK } from "@/lib/pool/history";
import type { Points } from "@/lib/pool/history";
import { windowPace } from "@/lib/pool/pace";
import { lockedHours, locksFrom, shiftOf, spiralOf } from "@/lib/pool/spiral";
import type { Turn } from "@/lib/pool/spiral";
import { timeIn } from "@/lib/time/zone";

const pacific = timeIn("America/Los_Angeles");

const day = (month: number, date: number, hour = 0, minute = 0) =>
  pacific.instant(2026, month, date, hour, minute);

const resetsAt = Date.UTC(2026, 10, 8, 2);
const now = Date.UTC(2026, 10, 5, 20);

const utc = (month: number, date: number, hour = 0, minute = 0) =>
  Date.UTC(2026, month, date, hour, minute);

const points: Points = [
  [utc(9, 29, 16, 17), 100],
  [utc(10, 1, 2, 10), 0],
  [utc(10, 2, 18), 50],
  [utc(10, 3, 5, 29), 100],
  [utc(10, 3, 9), 0],
  [utc(10, 4, 3, 33), 100],
  [utc(10, 5, 19), 100],
];

const paceOf = (resets: number, used: number, at: number, seen: Points) =>
  windowPace({ cutoff: 100, elapsed: null, resetsAt: resets, sampledAt: at, used }, seen, at);

const spiral = spiralOf({
  accountSince: null,
  calendar: pacific,
  daily: {
    days: [
      [utc(9, 20, 7), 24],
      [utc(9, 21, 7), 0],
    ],
    id: "a",
  },
  now,
  pace: paceOf(resetsAt, 100, now, points),
  points,
  since: utc(9, 17, 7),
});

const ranOutTurn = (from: number, ranOut: number): Turn => ({
  cells: [],
  current: false,
  days: [],
  from,
  line: [],
  locks: [],
  part: false,
  ranOut,
  resets: [],
  runOuts: [ranOut],
  to: from + 7 * DAY,
});

describe("spiral", () => {
  test("one turn per limit week, each from a reset, newest last", () => {
    expect(spiral.turns.map((turn) => [turn.from, turn.to])).toEqual(
      [4, 3, 2, 1].map((back) => [resetsAt - back * WEEK, resetsAt - (back - 1) * WEEK]),
    );
    expect(spiral.turns.at(-1)?.current).toBe(true);
    expect(spiral.turns.at(-1)?.line[0]).toEqual([resetsAt - WEEK, 0]);
  });

  test("days before hourly readings are one estimated cell each, cut at the reset", () => {
    expect(spiral.turns[1]?.cells[2]).toEqual({
      from: utc(9, 20, 2),
      to: utc(9, 21, 2),
      used: 19,
    });
    expect(spiral.turns[0]?.cells[0]?.used).toBeNull();
  });

  test("hours before the first reading read as none, after it as hours", () => {
    const cells = spiral.turns[2]?.cells ?? [];
    const before = cells.find((cell) => cell.from === utc(9, 29, 15));
    const first = cells.find((cell) => cell.from === utc(9, 29, 16));

    expect(before?.used).toBeNull();
    expect(first?.to).toBe(utc(9, 29, 17));
    expect(first?.used).toBe(0);
  });

  test("a lock already on when readings start has no run-out", () => {
    const lockedAtStart = spiral.turns.at(2);

    expect(lockedAtStart?.locks).toEqual([[utc(9, 29, 16, 17), resetsAt - WEEK]]);
    expect(lockedAtStart?.ranOut).toBeNull();
    expect(spiral.turns.at(-1)?.resets).toEqual([utc(10, 1, 2, 10), utc(10, 3, 9)]);
  });

  test("every run-out in a week counts, the first one leads", () => {
    const latest = spiral.turns.at(-1);

    expect(latest?.runOuts).toEqual([utc(10, 3, 5, 29), utc(10, 4, 3, 33)]);
    expect(latest?.ranOut).toBe(utc(10, 3, 5, 29));
    expect(shiftOf(spiral.turns, 3)).toBeNull();
  });

  test("a lock runs to its reset, even when the reading that shows it comes later", () => {
    const week = spiral.turns.at(-1);
    const later = utc(10, 12, 20);

    const seen: Points = [
      [utc(10, 2, 18), 50],
      [utc(10, 7, 20), 100],
      [resetsAt + 10 * 60_000, 0],
    ];

    const longer = spiralOf({
      accountSince: null,
      calendar: pacific,
      daily: { days: [], id: "a" },
      now: later,
      pace: paceOf(resetsAt + WEEK, 0, later, seen),
      points: seen,
      since: utc(10, 2),
    });

    expect(week === undefined ? [] : locksFrom(spiral, week)).toEqual([
      [utc(10, 3, 5, 29), utc(10, 3, 9)],
      [utc(10, 4, 3, 33), resetsAt],
    ]);
    expect(longer.turns.map((turn) => locksFrom(longer, turn))).toEqual([
      [[utc(10, 7, 20), resetsAt]],
      [],
    ]);
  });

  test("the shift compares where in the week each run-out came", () => {
    const turns = [ranOutTurn(day(9, 19), day(9, 23, 15)), ranOutTurn(day(9, 26), day(9, 30, 11))];

    expect(shiftOf(turns, 1)).toEqual({
      earlier: 4 * HOUR,
      than: day(9, 19),
    });
  });

  test("locked hours count the usual ones apart", () => {
    const usual = Array.from({ length: 24 }, (_, hour) => hour >= 9);

    expect(lockedHours([[day(10, 3, 7), day(10, 3, 11)]], usual, pacific)).toEqual({
      all: 4 * HOUR,
      usual: 2,
    });
  });
});
