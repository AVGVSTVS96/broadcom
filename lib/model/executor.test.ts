import { describe, expect, test } from "bun:test";

import { needs, releasesBehind, sameSource, shortRelease } from "./executor";
import type { ExecutorApp } from "./executor";

const app = (over: Partial<ExecutorApp>): ExecutorApp => ({
  accounts: [],
  deployedAt: null,
  id: "app_1",
  local: true,
  name: "Mail",
  pinned: null,
  requirements: [],
  running: true,
  slug: "mail",
  versions: 1,
  ...over,
});

describe("releasesBehind", () => {
  test("counts releases between the pin and the host", () => {
    expect(
      releasesBehind(app({ pinned: "0.0.1-beta.70" }), "0.0.1-beta.120")
    ).toBe(50);
  });

  test("is zero when either side is unknown or they match", () => {
    expect(releasesBehind(app({ pinned: null }), "0.0.1-beta.120")).toBe(0);
    expect(releasesBehind(app({ pinned: "0.0.1-beta.9" }), null)).toBe(0);
    expect(
      releasesBehind(app({ pinned: "0.0.1-beta.9" }), "0.0.1-beta.9")
    ).toBe(0);
  });
});

test("shortRelease drops the shared prefix", () => {
  expect(shortRelease("0.0.1-beta.120")).toBe("beta.120");
});

test("needs lists one row per linked account, or a missing row", () => {
  const rows = needs(
    app({
      accounts: [
        {
          checkedAt: "2026-10-15T15:07:38.795Z",
          health: "healthy",
          label: "work",
          requirement: "mail",
        },
        {
          checkedAt: null,
          health: "expired",
          label: "home",
          requirement: "mail",
        },
      ],
      requirements: ["calendar", "mail"],
    })
  );

  expect(rows.map((row) => [row.requirement, row.label, row.health])).toEqual([
    ["calendar", null, "missing"],
    ["mail", "work", "healthy"],
    ["mail", "home", "failing"],
  ]);
});

test("sameSource ignores a trailing newline", () => {
  expect(sameSource({ deployed: "a\n", local: "a", path: "index.ts" })).toBe(
    true
  );
  expect(sameSource({ deployed: null, local: "a", path: "index.ts" })).toBe(
    false
  );
});
