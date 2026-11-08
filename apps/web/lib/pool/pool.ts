import type { Points } from "@/lib/pool/history";
import { nameOf, namesOf } from "@/lib/pool/names";
import { windowPace } from "@/lib/pool/pace";
import type { Pace } from "@/lib/pool/pace";
import { creditTone, poolTone, windowTone } from "@/lib/pool/tone";
import type { Tone } from "@/lib/pool/tone";
import type { Account, Grant } from "@/lib/proxy/schema";

export interface Login {
  readonly id: string;
  readonly name: string;
  readonly account: Account;
  readonly grants: readonly Grant[];
  readonly hasPlan: boolean;
}

export const logins = (
  accounts: readonly Account[],
  grants: readonly Grant[],
): readonly Login[] => {
  const keys = new Set(grants.map((grant) => grant.credentialId));

  const owners = accounts
    .filter((account) => !keys.has(account.id))
    .toSorted((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  const named = namesOf(accounts, grants);

  return owners.map((account) => ({
    account,
    grants: grants.filter((grant) => grant.account === account.id),
    hasPlan: account.plan !== "",
    id: account.id,
    name: nameOf(named, account.id),
  }));
};

export const hasRoom = (account: Account) =>
  account.standing !== "limited" && account.standing !== "signed-out";

export const left = (used: number | null) => (used === null ? null : Math.max(0, 100 - used));

export const creditLeft = (grants: readonly Grant[]) =>
  grants.reduce((total, grant) => total + Math.max(0, grant.remaining), 0);

export const creditTotal = (grants: readonly Grant[]) =>
  grants.reduce((total, grant) => total + grant.allowance, 0);

export interface Plan extends Login {
  readonly pace: Pace | null;
}

export const plansOf = (
  accounts: Readonly<Record<string, Account>>,
  grants: readonly Grant[],
  history: Readonly<Record<string, Points>>,
  now: number,
): readonly Plan[] =>
  logins(Object.values(accounts), grants).map((login) => ({
    ...login,
    pace: login.hasPlan ? windowPace(login.account.week, history[login.id] ?? [], now) : null,
  }));

export interface Part {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly tone: Tone;
  readonly locked: boolean;
}

export interface Column {
  readonly left: number;
  readonly total: number;
  readonly tone: Tone;
  readonly parts: readonly Part[];
}

const columnOf = (parts: readonly Part[], room: number, total: number) => ({
  left: room,
  parts,
  tone: poolTone(parts.map((part) => part.tone)),
  total,
});

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export const poolOf = (plans: readonly Plan[]) => {
  const subscriptions = plans.filter((plan) => plan.hasPlan);
  const open = subscriptions.filter((plan) => hasRoom(plan.account));
  const grants = plans.flatMap((plan) => plan.grants);

  const week = subscriptions.map((plan): Part => ({
    id: plan.id,
    label: plan.name,
    locked: plan.pace?.locked === true,
    tone: windowTone(plan.account.week, plan.pace),
    value: left(plan.account.week.used) ?? 0,
  }));

  const session = subscriptions.map((plan): Part => {
    const room = hasRoom(plan.account);

    return {
      id: plan.id,
      label: plan.name,
      locked: !room,
      tone: room ? windowTone(plan.account.fiveHour) : "bad",
      value: room ? (left(plan.account.fiveHour.used) ?? 0) : 0,
    };
  });

  const credit = grants.map((grant): Part => ({
    id: grant.credentialId,
    label: plans.find((plan) => plan.id === grant.account)?.name ?? "",
    locked: false,
    tone: creditTone(grant.remaining, grant.allowance),
    value: (Math.max(0, grant.remaining) / grant.allowance) * 100,
  }));

  const [firstBack] = subscriptions
    .filter((plan) => !hasRoom(plan.account) && plan.account.week.resetsAt !== null)
    .toSorted((a, b) => (a.account.week.resetsAt ?? 0) - (b.account.week.resetsAt ?? 0));

  const [sessionReset] = open
    .flatMap((plan) => plan.account.fiveHour.resetsAt ?? [])
    .toSorted((a, b) => a - b);

  return {
    credit: {
      ...columnOf(credit, creditLeft(grants), creditTotal(grants)),
      empty: credit.filter((part) => part.tone === "bad").length,
      endsAt: grants.length === 0 ? null : Math.min(...grants.map((grant) => grant.expiresAt)),
    },
    firstBack,
    open,
    session: columnOf(session, sum(session.map((part) => part.value)), session.length * 100),
    sessionReset,
    subscriptions,
    week: columnOf(week, sum(week.map((part) => part.value)), week.length * 100),
  };
};

export type Paced = Plan & { readonly pace: Pace };

export const byPace = (plans: readonly Plan[]): Paced[] =>
  plans
    .filter((plan): plan is Paced => plan.pace !== null)
    .toSorted(
      (a, b) =>
        Number(a.pace.locked) - Number(b.pace.locked) ||
        (a.pace.locked
          ? a.pace.resetsAt - b.pace.resetsAt
          : (b.pace.pace ?? 0) - (a.pace.pace ?? 0)),
    );

export type Summary = ReturnType<typeof poolOf>;
