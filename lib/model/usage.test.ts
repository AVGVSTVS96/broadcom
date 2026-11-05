import { describe, expect, test } from "bun:test";

import {
  accountNames,
  cellsOf,
  format,
  formatShort,
  sumCells,
} from "@/lib/model/usage";

const zone = "America/Los_Angeles";

const hour = 3_600_000;

const steps = (start: number, count: number, step: number) =>
  Array.from({ length: count }, (_, index) => ({ at: start + index * step }));

describe("cellsOf", () => {
  test("today splits into four six-hour blocks", () => {
    const midnight = Date.parse("2026-11-04T00:00:00-08:00");

    const cells = cellsOf(
      steps(midnight, 24, hour),
      "1h",
      zone,
      midnight + 13.5 * hour
    );

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

    expect(cells.map((cell) => cell.to - cell.from)).toEqual([
      6, 6, 6, 7, 6, 6, 6, 6,
    ]);
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
      ]
    )
  ).toEqual([3, 12]);
});

test("format keeps one unit per measure", () => {
  expect(format("api", 7292.77)).toBe("$7,293");
  expect(format("api", 12.5)).toBe("$12.50");
  expect(format("tokens", 16_325_765_496)).toBe("16.3B");
  expect(format("week", 20.004)).toBe("20%");
  expect(format("fiveHour", 2.66)).toBe("2.7%");
  expect(format("week", null)).toBe("–");
  expect(formatShort("api", 128.24)).toBe("$128");
  expect(formatShort("api", 4120)).toBe("$4.1K");
  expect(formatShort("week", 2.25)).toBe("2.3%");
});

test("accounts are named by login, API keys by the login they bill", () => {
  expect(
    accountNames(
      [
        { id: "a1", label: "ada101@gmail.com" },
        { id: "key1", label: "" },
      ],
      [{ account: "a1", credentialId: "key1" }]
    )
  ).toEqual({ a1: "ada101", key1: "ada101 API", none: "No account" });
});
