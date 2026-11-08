export interface Labeled {
  readonly id: string;
  readonly label: string;
}

export interface KeyOwner {
  readonly credentialId: string;
  readonly account: string;
}

const localPart = (label: string) => label.split("@")[0] ?? label;

const shorten = (labels: readonly string[]) => {
  const owners = new Map<string, Set<string>>();

  for (const label of labels) {
    const short = localPart(label);

    owners.set(short, (owners.get(short) ?? new Set()).add(label.toLowerCase()));
  }

  return labels.map((label) => {
    const short = localPart(label);

    return (owners.get(short)?.size ?? 0) > 1 ? label : short;
  });
};

export const namesOf = (
  accounts: readonly Labeled[],
  keys: readonly KeyOwner[],
): Readonly<Record<string, string>> => {
  const logins = accounts.filter((entry) => entry.label !== "");
  const short = shorten(logins.map((entry) => entry.label));

  const named = new Map(logins.map((entry, index) => [entry.id, short[index] ?? entry.label]));

  for (const key of keys) {
    const owner = named.get(key.account);

    if (owner !== undefined) {
      named.set(key.credentialId, `${owner} API`);
    }
  }

  named.set("none", "No account");

  return Object.fromEntries(named);
};

export const nameOf = (names: Readonly<Record<string, string>>, id: string | null) =>
  id === null ? "No account" : (names[id] ?? `API key ${id.slice(-6)}`);
