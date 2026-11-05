import type { Points } from "@/lib/model/history";
import { windowPace } from "@/lib/model/pace";
import type { Pace } from "@/lib/model/pace";
import type { Account, Grant } from "@/lib/proxy/schema";

export interface Login {
  readonly id: string;
  readonly name: string;
  readonly account: Account;
  readonly grants: readonly Grant[];
  readonly hasPlan: boolean;
}

export const emptyCredit = 1;

const localPart = (label: string) => label.split("@")[0] ?? label;

export const names = (labels: readonly string[]) => {
  const counts = new Map<string, number>();

  for (const label of labels) {
    const short = localPart(label);

    counts.set(short, (counts.get(short) ?? 0) + 1);
  }

  return labels.map((label) => {
    const short = localPart(label);

    return (counts.get(short) ?? 0) > 1 ? label : short;
  });
};

export const logins = (
  accounts: readonly Account[],
  grants: readonly Grant[]
): readonly Login[] => {
  const keys = new Set(grants.map((grant) => grant.credentialId));

  const owners = accounts
    .filter((account) => !keys.has(account.id))
    .toSorted((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  const labels = names(
    owners.map((account) => account.label || `API key ${account.id.slice(-6)}`)
  );

  return owners.map((account, index) => ({
    account,
    grants: grants.filter((grant) => grant.account === account.id),
    hasPlan: account.plan !== "",
    id: account.id,
    name: labels[index] ?? account.id,
  }));
};

export const hasRoom = (account: Account) =>
  account.standing !== "limited" && account.standing !== "signed-out";

export const left = (used: number | null) =>
  used === null ? null : Math.max(0, 100 - used);

export const creditLeft = (grants: readonly Grant[]) =>
  grants.reduce((sum, grant) => sum + grant.remaining, 0);

export const creditTotal = (grants: readonly Grant[]) =>
  grants.reduce((sum, grant) => sum + grant.allowance, 0);

export interface Plan extends Login {
  readonly pace: Pace | null;
}

export const plansOf = (
  accounts: Readonly<Record<string, Account>>,
  grants: readonly Grant[],
  history: Readonly<Record<string, Points>>,
  now: number
): readonly Plan[] =>
  logins(Object.values(accounts), grants).map((login) => ({
    ...login,
    pace: login.hasPlan
      ? windowPace(login.account.week, history[login.id] ?? [], now)
      : null,
  }));

export const byPace = (plans: readonly Plan[]) =>
  plans
    .filter((plan) => plan.pace !== null)
    .toSorted((a, b) => (b.pace?.pace ?? 0) - (a.pace?.pace ?? 0));
