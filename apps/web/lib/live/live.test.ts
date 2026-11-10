import { describe, expect, test } from "bun:test";

import { decodeLiveEvent } from "@/lib/live/decode";
import { applyChange, lose, regain } from "@/lib/live/event";
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
      live: { accounts: { a1: account }, lost: {}, pool: null, sessions: {} },
      type: "snapshot",
    });
  });

  test("a patch replaces, adds and removes accounts", () => {
    const before = { accounts: { a1: account }, lost: { usage: 5 }, pool: null, sessions: {} };
    const second = { ...account, id: "a2" };

    const after = applyChange(before, {
      accounts: { a1: null, a2: second },
      pool: null,
      sessions: {},
    });

    expect(after.accounts).toEqual({ a2: second });
    expect(after.lost).toEqual({ usage: 5 });
  });

  test("stale names the resources to refetch", () => {
    expect(decodeLiveEvent(JSON.stringify({ tags: ["usage"], type: "stale" }))).toEqual({
      tags: ["usage"],
      type: "stale",
    });
  });

  test("a lost link keeps the time it first went down", () => {
    const live = { accounts: {}, lost: {}, pool: null, sessions: {} };

    expect(lose(lose(live, "proxy", 1), "proxy", 2).lost).toEqual({ proxy: 1 });
  });

  test("regaining a link clears only its own mark", () => {
    const live = { accounts: {}, lost: { proxy: 1, usage: 2 }, pool: null, sessions: {} };

    expect(regain(live, "proxy").lost).toEqual({ usage: 2 });
  });

  test("a snapshot from a server that predates lost marks still takes them", () => {
    const older = { accounts: {}, pool: null, sessions: {} };
    const patched = applyChange(older, { accounts: {}, pool: null, sessions: {} });

    expect(patched.lost).toBeUndefined();
    expect(lose(patched, "dashboard", 1).lost).toEqual({ dashboard: 1 });
    expect(regain(older, "proxy").lost).toEqual({});
  });
});
