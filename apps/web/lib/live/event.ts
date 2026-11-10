import type {
  Account as AccountType,
  LiveSession as LiveSessionType,
  Pool as PoolType,
} from "@/lib/proxy/schema";

export interface Live {
  readonly accounts: Readonly<Record<string, AccountType>>;
  readonly sessions: Readonly<Record<string, LiveSessionType>>;
  readonly pool: PoolType | null;
  readonly lost?: LostSince;
}

export type LostSince = Readonly<Partial<Record<Link, number>>>;

export type Link = "proxy" | "usage" | "dashboard";

export interface LiveChange {
  readonly accounts: Readonly<Record<string, AccountType | null>>;
  readonly sessions: Readonly<Record<string, LiveSessionType | null>>;
  readonly pool: PoolType | null;
}

export type LiveEvent =
  | { readonly type: "snapshot"; readonly live: Live }
  | { readonly type: "patch"; readonly change: LiveChange }
  | { readonly type: "stale"; readonly tags: readonly string[] };

export const present = <A>(entries: Readonly<Record<string, A | null>>) =>
  Object.fromEntries(
    Object.entries(entries).filter((entry): entry is [string, A] => entry[1] !== null),
  );

export const applyChange = (live: Live, change: LiveChange): Live => ({
  ...live,
  accounts: present({ ...live.accounts, ...change.accounts }),
  pool: change.pool ?? live.pool,
  sessions: present({ ...live.sessions, ...change.sessions }),
});

export const lose = (live: Live, link: Link, at: number): Live =>
  live.lost?.[link] === undefined ? { ...live, lost: { ...live.lost, [link]: at } } : live;

export const regain = (live: Live, link: Link): Live => ({
  ...live,
  lost: Object.fromEntries(Object.entries(live.lost ?? {}).filter(([name]) => name !== link)),
});
