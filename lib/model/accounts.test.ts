import { describe, expect, test } from "bun:test";

import {
  accountRows,
  creditTotals,
  creditOf,
  loginOf,
  resets,
} from "@/lib/model/accounts";
import type { Account, Credential, Grant } from "@/lib/proxy/schema";

const window = (used: number | null, resetsAt: number | null = null) => ({
  cutoff: 98,
  elapsed: null,
  resetsAt,
  sampledAt: null,
  used,
});

const account = (
  id: string,
  label: string,
  extra: Partial<Account> = {}
): Account => ({
  atLimit: null,
  cloud: null,
  fiveHour: window(null),
  heldResets: [],
  id,
  idle: 0,
  label,
  plan: label === "" ? "" : "Max 20x",
  rank: null,
  reasons: [],
  signInUntil: null,
  since: null,
  standing: "open",
  week: window(10),
  working: 0,
  ...extra,
});

const credential = (
  name: string,
  extra: Partial<Credential> = {}
): Credential => ({
  auth_index: name,
  disabled: false,
  email: name,
  name,
  provider: "claude",
  status: "active",
  ...extra,
});

const grant = (
  credentialId: string,
  owner: string,
  remaining: number
): Grant => ({
  account: owner,
  allowance: 200,
  credentialId,
  expiresAt: 0,
  lastRequestAt: null,
  monthlyCap: 200,
  observedAt: 0,
  organization: "Org",
  proxyUsd: 200 - remaining,
  recorded: 0,
  remaining,
  renewsAt: 0,
  requests: 1,
  startsAt: 0,
  unpriced: 0,
});

describe("accountRows", () => {
  test("joins a sign-in to its live account by email, ignoring case", () => {
    const rows = accountRows({
      accounts: { a1: account("a1", "One@Example.com") },
      credits: [],
      logins: [loginOf(credential("one@example.com"))],
      order: ["a1"],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.account?.id).toBe("a1");
    expect(rows[0]?.login?.name).toBe("one@example.com");
  });

  test("names an API key after the login on the same org and calls it empty under $1", () => {
    const rows = accountRows({
      accounts: {
        a1: account("a1", "one@example.com"),
        "claude:apikey:k": account("claude:apikey:k", ""),
      },
      credits: [creditOf(grant("claude:apikey:k", "a1", 0.54))],
      logins: [loginOf(credential("one@example.com"))],
      order: ["a1", "claude:apikey:k"],
    });

    const key = rows.find((row) => row.kind === "api");

    expect(key?.name).toBe("one@example.com API");
    expect(key?.state.is).toBe("empty");
  });

  test("shows a live account the credential list doesn't have yet", () => {
    const rows = accountRows({
      accounts: { a2: account("a2", "new@example.com") },
      credits: [],
      logins: [],
      order: [],
    });

    expect(rows.map((row) => row.name)).toEqual(["new@example.com"]);
  });

  test("disabled and sign-in states win over the pool's standing", () => {
    const rows = accountRows({
      accounts: {
        a1: account("a1", "a@example.com", { standing: "next" }),
        a2: account("a2", "b@example.com", { standing: "limited" }),
      },
      credits: [],
      logins: [
        loginOf(credential("a@example.com", { disabled: true })),
        loginOf(credential("b@example.com", { requires_sign_in: true })),
      ],
      order: ["a1", "a2"],
    });

    expect(rows.map((row) => row.state.is)).toEqual(["disabled", "sign-in"]);
  });

  test("a limited plan is back when its spent window resets", () => {
    const rows = accountRows({
      accounts: {
        a1: account("a1", "a@example.com", {
          standing: "limited",
          week: window(100, 5000),
        }),
      },
      credits: [],
      logins: [],
      order: ["a1"],
    });

    expect(rows[0]?.state).toEqual({ is: "limited", until: 5000 });
  });

  test("orders plans by the pool, then API keys, then ChatGPT", () => {
    const rows = accountRows({
      accounts: {
        a1: account("a1", "a@example.com"),
        a2: account("a2", "b@example.com"),
      },
      credits: [creditOf(grant("claude:apikey:k", "a1", 50))],
      logins: [
        loginOf(credential("gpt@example.com", { provider: "codex" })),
        loginOf(credential("a@example.com")),
        loginOf(credential("b@example.com")),
      ],
      order: ["a2", "a1"],
    });

    expect(rows.map((row) => row.name)).toEqual([
      "b@example.com",
      "a@example.com",
      "a@example.com API",
      "gpt@example.com",
    ]);
  });

  test("a failed sign-in carries the proxy's message", () => {
    const rows = accountRows({
      accounts: {},
      credits: [],
      logins: [
        loginOf(
          credential("a@example.com", {
            status: "error",
            status_message: "refresh token revoked",
          })
        ),
      ],
      order: [],
    });

    expect(rows[0]?.state).toEqual({
      is: "error",
      message: "refresh token revoked",
    });
  });
});

describe("totals", () => {
  test("credit adds up what's left, never below zero", () => {
    const rows = accountRows({
      accounts: {},
      credits: [
        creditOf(grant("k1", "a1", 120)),
        creditOf(grant("k2", "a1", -3)),
      ],
      logins: [],
      order: [],
    });

    expect(creditTotals(rows)).toEqual({
      allowance: 400,
      count: 2,
      empty: 1,
      remaining: 120,
    });
  });

  test("resets count what's held and list recent spends", () => {
    const rows = accountRows({
      accounts: {
        a1: account("a1", "a@example.com", {
          heldResets: [
            { expiresAt: 900, kind: "week", left: 2 },
            { expiresAt: 400, kind: "week", left: 1 },
          ],
          resetPlan: "Spends one Sat 6 PM",
          resetsSpent: [50, 500],
        }),
      },
      credits: [],
      logins: [],
      order: [],
    });

    expect(resets(rows, 100)).toEqual({
      firstExpiry: 400,
      held: 3,
      plans: ["Spends one Sat 6 PM"],
      spent: [{ at: 500, name: "a@example.com" }],
    });
  });
});
