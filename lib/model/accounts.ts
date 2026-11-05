import type { Account, Credential, Grant } from "@/lib/proxy/schema";

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
  | { readonly is: "limited"; readonly until: number | null }
  | { readonly is: "disabled" }
  | { readonly is: "sign-in" }
  | { readonly is: "error"; readonly message: string }
  | { readonly is: "cooling"; readonly message: string }
  | { readonly is: "empty" };

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

export const emptyBelow = 1;

export const week = 7 * 86_400_000;

const text = (...values: readonly (string | undefined)[]) =>
  values.map((value) => value?.trim() ?? "").find((value) => value !== "") ??
  "";

export const loginOf = (credential: Credential): Login => {
  const message = text(credential.status_message);

  return {
    cooling:
      credential.unavailable === true ? text(message, "Cooling down") : null,
    disabled: credential.disabled,
    error:
      credential.status === "error" ? text(message, "Sign-in failed") : null,
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

const limitedUntil = (account: Account) => {
  const windows = [account.week, account.fiveHour].filter(
    (window) =>
      window.used !== null &&
      window.used >= window.cutoff &&
      window.resetsAt !== null
  );

  return windows.length === 0
    ? null
    : Math.max(...windows.map((window) => window.resetsAt ?? 0));
};

const stateOf = (
  login: Login | null,
  account: Account | null,
  credit: Credit | null
): State => {
  if (login?.disabled === true) {
    return { is: "disabled" };
  }

  if (login?.signIn === true || account?.standing === "signed-out") {
    return { is: "sign-in" };
  }

  if (login !== null && login.error !== null) {
    return { is: "error", message: login.error };
  }

  if (credit !== null && credit.remaining < emptyBelow) {
    return { is: "empty" };
  }

  if (account?.standing === "limited") {
    return { is: "limited", until: limitedUntil(account) };
  }

  if (login !== null && login.cooling !== null) {
    return { is: "cooling", message: login.cooling };
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

  const fromLogins = logins.map((entry): Row => {
    const account =
      entry.provider === "claude"
        ? (live.find(
            (candidate) =>
              candidate.label !== "" && same(candidate.label, entry.login)
          ) ?? null)
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
      name: entry.login,
      provider: entry.provider,
      state: stateOf(entry, account, null),
    };
  });

  const fromCredits = credits.map((entry): Row => {
    claimed.add(entry.id);
    const account = accounts[entry.id] ?? null;
    const owner = accounts[entry.account]?.label;

    return {
      account,
      credit: entry,
      key: entry.id,
      kind: "api",
      login: null,
      name: owner === undefined || owner === "" ? "API key" : `${owner} API`,
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
      name: account.label === "" ? "API key" : account.label,
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
      left.name.localeCompare(right.name)
  );
};

export const hasRoom = (row: Row) =>
  row.state.is === "next" || row.state.is === "open";

export interface Resets {
  readonly held: number;
  readonly firstExpiry: number | null;
  readonly plans: readonly string[];
  readonly spent: readonly { readonly name: string; readonly at: number }[];
}

export const resets = (rows: readonly Row[], since: number): Resets => {
  const held = rows.flatMap((row) => row.account?.heldResets ?? []);

  const expiries = held.flatMap((reset) =>
    reset.expiresAt === null ? [] : [reset.expiresAt]
  );

  return {
    firstExpiry: expiries.length === 0 ? null : Math.min(...expiries),
    held: held.reduce((sum, reset) => sum + reset.left, 0),
    plans: rows.flatMap((row) =>
      row.account?.resetPlan === undefined || row.account.resetPlan === ""
        ? []
        : [row.account.resetPlan]
    ),
    spent: rows
      .flatMap((row) =>
        (row.account?.resetsSpent ?? []).map((at) => ({ at, name: row.name }))
      )
      .filter((entry) => entry.at >= since)
      .toSorted((left, right) => right.at - left.at),
  };
};

export const creditTotals = (rows: readonly Row[]) => {
  const credits = rows.flatMap((row) =>
    row.credit === null ? [] : [row.credit]
  );

  return {
    allowance: credits.reduce((sum, entry) => sum + entry.allowance, 0),
    count: credits.length,
    empty: credits.filter((entry) => entry.remaining < emptyBelow).length,
    remaining: credits.reduce(
      (sum, entry) => sum + Math.max(0, entry.remaining),
      0
    ),
  };
};
