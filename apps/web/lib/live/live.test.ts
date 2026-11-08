import { describe, expect, test } from "bun:test";

import { decodeLiveEvent } from "@/lib/live/decode";
import { applyChange } from "@/lib/live/event";
import type { Account } from "@/lib/proxy/schema";

const window = {
  cutoff: 90,
  elapsed: 0.5,
  resetsAt: 2,
  sampledAt: 1,
  used: 40,
};

const account: Account = {
  atLimit: null,
  cloud: null,
  fiveHour: window,
  heldResets: [],
  id: "a1",
  idle: 0,
  label: "first",
  plan: "Max 20x",
  rank: 1,
  reasons: [],
  signInUntil: null,
  since: null,
  standing: "next",
  week: window,
  working: 2,
};

describe("live events", () => {
  test("a snapshot splits keys by kind and drops what doesn't decode", () => {
    const event = decodeLiveEvent(
      JSON.stringify({
        live: {
          "a:a1": account,
          "a:bad": { id: 1 },
          "app:hex": { connected: true },
        },
        type: "snapshot",
      }),
    );

    expect(event).toEqual({
      live: { accounts: { a1: account }, pool: null, sessions: {} },
      type: "snapshot",
    });
  });

  test("a patch replaces, adds and removes accounts", () => {
    const before = { accounts: { a1: account }, pool: null, sessions: {} };
    const second = { ...account, id: "a2" };

    const after = applyChange(before, {
      accounts: { a1: null, a2: second },
      pool: null,
      sessions: {},
    });

    expect(after.accounts).toEqual({ a2: second });
  });

  test("stale names the resources to refetch", () => {
    expect(decodeLiveEvent(JSON.stringify({ tags: ["usage"], type: "stale" }))).toEqual({
      tags: ["usage"],
      type: "stale",
    });
  });
});
