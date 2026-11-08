import { describe, expect, test } from "bun:test";

import { namesOf } from "@/lib/pool/names";
import {
  cellsOf,
  coverageOf,
  format,
  formatShort,
  gapsOf,
  readingsOf,
  stackOf,
  sumCells,
  totalOf,
  valuesOf,
} from "@/lib/usage/usage";

const zone = "America/Los_Angeles";

const hour = 3_600_000;

const steps = (start: number, count: number, step: number) =>
  Array.from({ length: count }, (_, index) => ({ at: start + index * step }));

describe("cellsOf", () => {
  test("today splits into four six-hour blocks", () => {
    const midnight = Date.parse("2026-11-04T00:00:00-08:00");

    const cells = cellsOf(steps(midnight, 24, hour), "1h", zone, midnight + 13.5 * hour);

    expect(cells.map((cell) => [cell.label, cell.from, cell.to])).toEqual([
      ["00:00", 0, 6],
      ["06:00", 6, 12],
      ["12:00", 12, 18],
      ["18:00", 18, 24],
    ]);
    expect(cells.map((cell) => cell.now)).toEqual([null, null, 1, null]);
  });

  test("thirty days group by Monday weeks and name the current one", () => {
    const start = Date.parse("2026-10-06T00:00:00-07:00");

    const buckets = Array.from({ length: 31 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 9, 6 + index, 12));
      const offset = date.getUTCMonth() === 9 ? "-07:00" : "-08:00";

      return {
        at: Date.parse(`${date.toISOString().slice(0, 10)}T00:00:00${offset}`),
      };
    });

    const cells = cellsOf(buckets, "1d", zone, start + 30.5 * 24 * hour);

    expect(cells.map((cell) => cell.label)).toEqual([
      "Oct 6",
      "Oct 12",
      "Oct 19",
      "Oct 26",
      "This week",
    ]);
    expect(cells[0]?.to).toBe(6);
    expect(cells.at(-1)?.now).toBe(3);
  });

  test("seven days group by local day across the clock change", () => {
    const start = Date.parse("2026-10-29T00:00:00-07:00");
    const buckets = steps(start, 49, 4 * hour);
    const cells = cellsOf(buckets, "4h", zone, start + 100 * hour);

    expect(cells.map((cell) => cell.to - cell.from)).toEqual([6, 6, 6, 7, 6, 6, 6, 6]);
    expect(cells.find((cell) => cell.now !== null)?.label).toBe("Today");
  });
});

test("sumCells adds each cell's buckets", () => {
  expect(
    sumCells(
      [1, 2, 3, 4, 5],
      [
        { from: 0, label: "a", now: null, to: 2 },
        { from: 2, label: "b", now: null, to: 5 },
      ],
    ),
  ).toEqual([3, 12]);
});

test("format keeps one unit per measure", () => {
  expect(format("api", 7292.77)).toBe("$7,293");
  expect(format("api", 12.5)).toBe("$12.50");
  expect(format("tokens", 16_325_765_496)).toBe("16.3B");
  expect(format("week", 20.004)).toBe("20%");
  expect(format("fiveHour", 2.66)).toBe("2.7%");
  expect(format("week", 315)).toBe("3.2 limits");
  expect(format("week", null)).toBe("–");
  expect(formatShort("api", 128.24)).toBe("$128");
  expect(formatShort("api", 4120)).toBe("$4.1K");
  expect(formatShort("week", 2.25)).toBe("2.3%");
});

test("accounts are named by login, API keys by the login they bill", () => {
  expect(
    namesOf(
      [
        { id: "a1", label: "ada101@gmail.com" },
        { id: "key1", label: "" },
      ],
      [{ account: "a1", credentialId: "key1" }],
    ),
  ).toEqual({ a1: "ada101", key1: "ada101 API", none: "No account" });
});

const amount = {
  apiUsd: 668,
  cacheRead: 0,
  input: 0,
  output: 0,
  planUsd: 12,
  requests: 1,
  tokens: 9,
};

test("a limit with spend but no points has no reading, not zero", () => {
  expect(valuesOf(amount, { fiveHour: 0, week: 4 })).toEqual({
    api: 668,
    fiveHour: null,
    plan: 12,
    tokens: 9,
    week: 4,
  });
  expect(valuesOf({ ...amount, apiUsd: 0 }, { fiveHour: 0, week: 0 }).week).toBe(0);
});

test("totals skip rows with no reading instead of counting them as zero", () => {
  const values = { api: 2, fiveHour: null, plan: 1, tokens: 3, week: 4 };

  expect(
    totalOf([
      { series: [1, 2], sessions: 2, values },
      { series: [0, 3], sessions: 1, values: { ...values, fiveHour: null } },
    ]),
  ).toEqual({
    series: [1, 5],
    sessions: 3,
    values: { api: 4, fiveHour: null, plan: 2, tokens: 6, week: 8 },
  });
});

test("the stack puts what the named layers leave under everything else", () => {
  expect(
    stackOf(
      [
        { key: "a", label: "a", values: [1, 0] },
        { key: "b", label: "b", values: [1, 2] },
      ],
      [5, 2],
    ).map((layer) => layer.values),
  ).toEqual([
    [1, 0],
    [1, 2],
    [3, 0],
  ]);
});

describe("coverage", () => {
  const start = Date.parse("2026-10-29T00:00:00-07:00");
  const buckets = steps(start, 18, 4 * hour);
  const cells = cellsOf(buckets, "4h", zone, start + 17 * 4 * hour);

  test("a bucket that spent with no limit points reads as missing", () => {
    expect(readingsOf([0, 3, 0], [0, 10, 5])).toEqual([null, "read", "missing"]);
  });

  test("missing buckets merge into gaps across idle ones", () => {
    expect(gapsOf(["read", "missing", null, "missing", "read", null, "missing"])).toEqual([
      { from: 1, to: 4 },
      { from: 6, to: 7 },
    ]);
  });

  test("days name the readings and weigh coverage by spend", () => {
    const points = Array.from({ length: 18 }, (_, index) => (index === 2 || index === 14 ? 5 : 0));

    const spend = Array.from({ length: 18 }, (_, index) => (index % 6 === 0 ? 0 : 10));

    expect(coverageOf(readingsOf(points, spend), spend, buckets, "4h", cells, zone)).toEqual({
      active: 3,
      missing: 50,
      read: ["Thu", "today"],
      share: 2 / 3,
    });
  });
});
