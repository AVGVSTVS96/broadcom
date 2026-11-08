import { describe, expect, test } from "bun:test";

import { DAY, HOUR } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import { lockedHours, locksFrom, shiftOf, spiralOf } from "@/lib/model/spiral";
import type { Turn } from "@/lib/model/spiral";

const day = (month: number, date: number, hour = 0, minute = 0) =>
  new Date(2026, month, date, hour, minute).getTime();

const points: Points = [
  [day(9, 29, 9, 17), 100],
  [day(9, 31, 18), 0],
  [day(10, 2, 10), 50],
  [day(10, 2, 21, 29), 100],
  [day(10, 3, 1), 0],
  [day(10, 3, 19, 33), 100],
  [day(10, 5, 11), 100],
];

const spiral = spiralOf({
  accountSince: null,
  daily: { days: [[day(9, 20), 24]], id: "a" },
  now: day(10, 5, 12),
  pace: null,
  points,
  since: day(9, 17),
});

const ranOutTurn = (from: number, ranOut: number): Turn => ({
  cells: [],
  current: false,
  days: [],
  from,
  line: [],
  locks: [],
  ranOut,
  resets: [],
  runOuts: [ranOut],
  to: from + 7 * DAY,
});

describe("spiral", () => {
  test("one turn per week from the first with a reading, newest last", () => {
    expect(spiral.turns.map((turn) => turn.from)).toEqual([
      day(9, 12),
      day(9, 19),
      day(9, 26),
      day(10, 2),
    ]);
    expect(spiral.turns.at(-1)?.current).toBe(true);
  });

  test("days before hourly readings are one estimated cell each", () => {
    const tuesday = spiral.turns[1]?.cells[1];

    expect(tuesday).toEqual({ from: day(9, 20), to: day(9, 21), used: 24 });
    expect(spiral.turns[0]?.cells[0]?.used).toBeNull();
  });

  test("hours before the first reading read as none, after it as hours", () => {
    const cells = spiral.turns[2]?.cells ?? [];
    const before = cells.find((cell) => cell.from === day(9, 29, 8));
    const first = cells.find((cell) => cell.from === day(9, 29, 9));

    expect(before?.used).toBeNull();
    expect(first?.to).toBe(day(9, 29, 9) + HOUR);
    expect(first?.used).toBe(0);
  });

  test("a lock already on when readings start has no run-out", () => {
    const lockedAtStart = spiral.turns.at(2);

    expect(lockedAtStart?.locks).toEqual([[day(9, 29, 9, 17), day(9, 31, 18)]]);
    expect(lockedAtStart?.ranOut).toBeNull();
    expect(lockedAtStart?.resets).toEqual([day(9, 31, 18)]);
  });

  test("every run-out in a week counts, the first one leads", () => {
    const latest = spiral.turns.at(-1);

    expect(latest?.runOuts).toEqual([day(10, 2, 21, 29), day(10, 3, 19, 33)]);
    expect(latest?.ranOut).toBe(day(10, 2, 21, 29));
    expect(shiftOf(spiral.turns, 3)).toBeNull();
  });

  test("a week's lock runs whole to its reset, even past the week", () => {
    const week = spiral.turns.at(-1);

    const longer = spiralOf({
      accountSince: null,
      daily: { days: [], id: "a" },
      now: day(10, 12, 12),
      pace: null,
      points: [
        [day(10, 2, 10), 50],
        [day(10, 7, 20), 100],
        [day(10, 11, 18), 0],
      ],
      since: day(10, 2),
    });

    expect(week === undefined ? [] : locksFrom(spiral, week)).toEqual([
      [day(10, 2, 21, 29), day(10, 3, 1)],
      [day(10, 3, 19, 33), day(10, 5, 12)],
    ]);
    expect(longer.turns.map((turn) => locksFrom(longer, turn))).toEqual([
      [[day(10, 7, 20), day(10, 11, 18)]],
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

    expect(lockedHours([[day(10, 3, 7), day(10, 3, 11)]], usual)).toEqual({
      all: 4 * HOUR,
      usual: 2,
    });
  });
});
