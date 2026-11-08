import { Option, Schema } from "effect";

import { nameOf, namesOf } from "@/lib/pool/names";
import { creditTone, emptyCredit } from "@/lib/pool/tone";
import type { Account, Credential, Grant, LimitWindow } from "@/lib/proxy/schema";

export interface Login {
  readonly name: string;
  readonly provider: string;
  readonly login: string;
  readonly disabled: boolean;
  readonly signIn: boolean;
  readonly error: string | null;
  readonly cooling: string | null;
}

export interface Credit {
  readonly id: string;
  readonly account: string;
  readonly organization: string;
  readonly remaining: number;
  readonly allowance: number;
  readonly spent: number;
  readonly requests: number;
  readonly expiresAt: number;
  readonly lastRequestAt: number | null;
}

export type Kind = "plan" | "api" | "chatgpt" | "other";

export type State =
  | { readonly is: "next" }
  | { readonly is: "open" }
  | {
      readonly is: "limited";
      readonly window: "week" | "session";
      readonly until: number | null;
    }
  | { readonly is: "disabled" }
  | { readonly is: "sign-in" }
  | { readonly is: "error"; readonly message: string }
  | { readonly is: "cooling"; readonly message: string }
  | { readonly is: "empty" }
  | { readonly is: "low" };

export interface Row {
  readonly key: string;
  readonly kind: Kind;
  readonly name: string;
  readonly provider: string;
  readonly login: Login | null;
  readonly account: Account | null;
  readonly credit: Credit | null;
  readonly state: State;
}

export const week = 7 * 86_400_000;

const text = (...values: readonly (string | undefined)[]) =>
  values.map((value) => value?.trim() ?? "").find((value) => value !== "") ?? "";

const Refusal = Schema.Struct({
  error: Schema.Struct({ message: Schema.String, type: Schema.String }),
});

const decodeRefusal = Schema.decodeUnknownOption(Schema.fromJsonString(Refusal));

export const problemOf = (message: string) =>
  Option.match(decodeRefusal(message), {
    onNone: () => ({ limit: /rate.?limit/iu.test(message), text: message }),
    onSome: ({ error }) => ({
      limit: error.type === "rate_limit_error",
      text: error.message,
    }),
  });

export const loginOf = (credential: Credential): Login => {
  const problem = problemOf(text(credential.status_message));
  const failed = credential.status === "error" && !problem.limit;
  const reason = problem.limit ? "Anthropic's rate limit" : problem.text;

  return {
    cooling: credential.unavailable === true || problem.limit ? reason : null,
    disabled: credential.disabled,
    error: failed ? text(problem.text, "Sign-in failed") : null,
    login: text(credential.email, credential.label, credential.name),
    name: credential.name,
    provider: credential.provider,
    signIn: credential.requires_sign_in === true,
  };
};

export const creditOf = (grant: Grant): Credit => ({
  account: grant.account,
  allowance: grant.allowance,
  expiresAt: grant.expiresAt,
  id: grant.credentialId,
  lastRequestAt: grant.lastRequestAt,
  organization: grant.organization,
  remaining: grant.remaining,
  requests: grant.requests,
  spent: grant.proxyUsd,
});

const kindOf = (provider: string): Kind => {
  if (provider === "claude") {
    return "plan";
  }

  return provider === "codex" ? "chatgpt" : "other";
};

const full = (window: LimitWindow) => window.used !== null && window.used >= window.cutoff;

const limitedOf = (account: Account): State => {
  const windows = [account.week, account.fiveHour].filter(
    (window) => full(window) && window.resetsAt !== null,
  );

  return {
    is: "limited",
    until: windows.length === 0 ? null : Math.max(...windows.map((window) => window.resetsAt ?? 0)),
    window: full(account.fiveHour) && !full(account.week) ? "session" : "week",
  };
};

const stateOf = (login: Login | null, account: Account | null, credit: Credit | null): State => {
  if (login?.disabled === true) {
    return { is: "disabled" };
  }

  if (login?.signIn === true || account?.standing === "signed-out") {
    return { is: "sign-in" };
  }

  if (login !== null && login.error !== null) {
    return { is: "error", message: login.error };
  }

  if (credit !== null && credit.remaining < emptyCredit) {
    return { is: "empty" };
  }

  if (account?.standing === "limited") {
    return limitedOf(account);
  }

  if (login !== null && login.cooling !== null) {
    return { is: "cooling", message: login.cooling };
  }

  if (credit !== null && creditTone(credit.remaining, credit.allowance) === "over") {
    return { is: "low" };
  }

  return account?.standing === "next" ? { is: "next" } : { is: "open" };
};

const same = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

export const kinds: readonly Kind[] = ["plan", "api", "chatgpt", "other"];

export const accountRows = ({
  logins,
  credits,
  accounts,
  order,
}: {
  logins: readonly Login[];
  credits: readonly Credit[];
  accounts: Readonly<Record<string, Account>>;
  order: readonly string[];
}): Row[] => {
  const live = Object.values(accounts);
  const claimed = new Set<string>();

  const named = namesOf(
    [...live, ...logins.map((entry) => ({ id: entry.name, label: entry.login }))],
    credits.map((entry) => ({ account: entry.account, credentialId: entry.id })),
  );

  const fromLogins = logins.map((entry): Row => {
    const account =
      entry.provider === "claude"
        ? (live.find((candidate) => candidate.label !== "" && same(candidate.label, entry.login)) ??
          null)
        : null;

    if (account !== null) {
      claimed.add(account.id);
    }

    return {
      account,
      credit: null,
      key: entry.name,
      kind: kindOf(entry.provider),
      login: entry,
      name: nameOf(named, account?.id ?? entry.name),
      provider: entry.provider,
      state: stateOf(entry, account, null),
    };
  });

  const fromCredits = credits.map((entry): Row => {
    claimed.add(entry.id);
    const account = accounts[entry.id] ?? null;

    return {
      account,
      credit: entry,
      key: entry.id,
      kind: "api",
      login: null,
      name: nameOf(named, entry.id),
      provider: "claude",
      state: stateOf(null, account, entry),
    };
  });

  const unmatched = live
    .filter((account) => !claimed.has(account.id))
    .map((account): Row => ({
      account,
      credit: null,
      key: account.id,
      kind: account.label === "" ? "api" : "plan",
      login: null,
      name: nameOf(named, account.id),
      provider: "claude",
      state: stateOf(null, account, null),
    }));

  const rank = (row: Row) => {
    const at = row.account === null ? -1 : order.indexOf(row.account.id);

    return at === -1 ? order.length : at;
  };

  return [...fromLogins, ...fromCredits, ...unmatched].toSorted(
    (left, right) =>
      kinds.indexOf(left.kind) - kinds.indexOf(right.kind) ||
      rank(left) - rank(right) ||
      left.name.localeCompare(right.name),
  );
};

export const needsYou = (row: Row) =>
  row.state.is === "disabled" || row.state.is === "error" || row.state.is === "sign-in";

const soon = 2 * 86_400_000;

export const endsSoon = (row: Row, now: number) => {
  const until = row.account?.signInUntil ?? null;

  return until !== null && until - now < soon;
};
