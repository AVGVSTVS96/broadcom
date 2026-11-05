import { plural, utcDate } from "@/lib/model/format";

const planPrices = new Map([
  ["Max 20x", 200],
  ["Max 5x", 100],
  ["Pro", 20],
]);

const harnessOf = new Map([
  ["anthropic", "claude"],
  ["openai", "codex"],
]);

export interface WalletInput {
  readonly seats: readonly {
    readonly id: string;
    readonly name: string;
    readonly plan: string;
  }[];
  readonly plans: readonly {
    readonly name: string;
    readonly monthly: number;
    readonly providers: readonly string[];
    readonly since: number | null;
  }[];
  readonly grants: readonly {
    readonly id: string;
    readonly name: string;
    readonly allowance: number;
    readonly remaining: number;
    readonly expiresAt: number;
  }[];
  readonly byAccount: Readonly<Record<string, number>>;
  readonly byHarness: Readonly<Record<string, number>>;
  readonly total: number;
}

export interface Part {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export interface Source {
  readonly key: string;
  readonly name: string;
  readonly detail: string;
  readonly plan: number | null;
  readonly credit: number | null;
  readonly ran: number;
  readonly parts: readonly Part[];
  readonly share: number;
}

export interface Wallet {
  readonly monthly: number;
  readonly plans: readonly string[];
  readonly unpriced: readonly string[];
  readonly credit: {
    readonly granted: number;
    readonly left: number;
    readonly ends: number;
    readonly count: number;
  } | null;
  readonly ran: number;
  readonly perDollar: number | null;
  readonly sources: readonly Source[];
}

const sum = (values: readonly number[]) =>
  values.reduce((total, value) => total + value, 0);

const counted = (names: readonly string[]) => {
  const counts = new Map<string, number>();

  for (const name of names) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts].map(([name, count]) =>
    count === 1 ? name : `${count} × ${name}`
  );
};

const byValue = (a: { value: number }, b: { value: number }) =>
  b.value - a.value;

export const walletOf = (input: WalletInput): Wallet => {
  const spent = (id: string) => input.byAccount[id] ?? 0;
  const priced = input.seats.filter((seat) => planPrices.has(seat.plan));

  const unpriced = input.seats
    .filter((seat) => seat.plan !== "" && !planPrices.has(seat.plan))
    .map((seat) => seat.plan);

  const creditParts = input.grants
    .map((grant) => ({
      key: grant.id,
      label: grant.name,
      value: spent(grant.id),
    }))
    .toSorted(byValue);

  const creditRan = sum(creditParts.map((part) => part.value));

  const seatParts = priced
    .map((seat) => ({ key: seat.id, label: seat.name, value: spent(seat.id) }))
    .toSorted(byValue);

  const claudeRan = Math.max(0, (input.byHarness.claude ?? 0) - creditRan);
  const unrecorded = claudeRan - sum(seatParts.map((part) => part.value));
  const claudePlan = sum(priced.map((seat) => planPrices.get(seat.plan) ?? 0));

  const claude: Source[] =
    priced.length === 0 && claudeRan <= 0
      ? []
      : [
          {
            credit: null,
            detail: counted(priced.map((seat) => seat.plan)).join(", "),
            key: "claude",
            name: "Claude",
            parts:
              unrecorded > 0.005
                ? [
                    ...seatParts,
                    { key: "none", label: "No account", value: unrecorded },
                  ]
                : seatParts,
            plan: priced.length === 0 ? null : claudePlan,
            ran: claudeRan,
            share: 0,
          },
        ];

  const configured: Source[] = input.plans.map((plan) => {
    const ran = sum(
      plan.providers.map(
        (provider) => input.byHarness[harnessOf.get(provider) ?? ""] ?? 0
      )
    );

    return {
      credit: null,
      detail: plan.since === null ? "" : `since ${utcDate(plan.since)}`,
      key: `plan:${plan.name}`,
      name: plan.name,
      parts: [{ key: plan.name, label: plan.name, value: ran }],
      plan: plan.monthly,
      ran,
      share: 0,
    };
  });

  const granted = sum(input.grants.map((grant) => grant.allowance));

  const credit: Source[] =
    input.grants.length === 0
      ? []
      : [
          {
            credit: granted,
            detail: `${plural(input.grants.length, "grant")}, ${input.grants.length === 1 ? "ends" : "end"} ${utcDate(Math.min(...input.grants.map((grant) => grant.expiresAt)))}`,
            key: "credit",
            name: "API credit",
            parts: creditParts,
            plan: null,
            ran: creditRan,
            share: 0,
          },
        ];

  const named = [...claude, ...configured, ...credit];
  const rest = input.total - sum(named.map((source) => source.ran));

  const sources = [
    ...named,
    ...(rest > input.total * 0.005
      ? [
          {
            credit: null,
            detail: "other harnesses",
            key: "other",
            name: "Other",
            parts: [{ key: "other", label: "Other", value: rest }],
            plan: null,
            ran: rest,
            share: 0,
          },
        ]
      : []),
  ]
    .map((source) => ({
      ...source,
      share: input.total > 0 ? source.ran / input.total : 0,
    }))
    .toSorted((a, b) => b.ran - a.ran);

  const monthly = claudePlan + sum(input.plans.map((plan) => plan.monthly));

  return {
    credit:
      input.grants.length === 0
        ? null
        : {
            count: input.grants.length,
            ends: Math.min(...input.grants.map((grant) => grant.expiresAt)),
            granted,
            left: sum(input.grants.map((grant) => grant.remaining)),
          },
    monthly,
    perDollar: monthly > 0 ? (input.total - creditRan) / monthly : null,
    plans: [
      ...counted(priced.map((seat) => `Claude ${seat.plan}`)),
      ...input.plans.map((plan) => plan.name),
    ],
    ran: input.total,
    sources,
    unpriced,
  };
};
