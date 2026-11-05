import type { LiveSession, MoveCause } from "@/lib/proxy/schema";

const hour = 3_600_000;

export const span = 24 * hour;

export interface Move {
  readonly at: number;
  readonly cause: MoveCause;
  readonly from: string | null;
  readonly label: string | null;
  readonly session: string;
  readonly to: string;
}

export interface Lane {
  readonly account: string;
  readonly started: readonly number[];
  readonly arrived: readonly number[];
  readonly left: readonly number[];
}

export interface Handoff {
  readonly at: number;
  readonly cause: MoveCause;
  readonly from: string | null;
  readonly to: string;
  readonly labels: readonly string[];
  readonly count: number;
}

export interface Handoffs {
  readonly from: number;
  readonly lanes: readonly Lane[];
  readonly recent: readonly Handoff[];
  readonly started: number;
  readonly moved: Readonly<Partial<Record<MoveCause, number>>>;
}

const hours = 24;

const empty = () => Array.from({ length: hours }, () => 0);

const group = (groups: Map<string, Handoff>, move: Move) => {
  const minute = Math.floor(move.at / 60_000);
  const key = `${minute} ${move.from} ${move.to} ${move.cause}`;
  const found = groups.get(key);
  const labels = found?.labels ?? [];

  groups.set(key, {
    at: Math.max(found?.at ?? 0, move.at),
    cause: move.cause,
    count: (found?.count ?? 0) + 1,
    from: move.from,
    labels:
      move.label === null || labels.includes(move.label)
        ? labels
        : [...labels, move.label],
    to: move.to,
  });
};

export const handoffs = (moves: readonly Move[], now: number): Handoffs => {
  const from = Math.floor((now - span) / hour) * hour + hour;

  const lanes = new Map<
    string,
    { started: number[]; arrived: number[]; left: number[] }
  >();

  const groups = new Map<string, Handoff>();
  const moved: Partial<Record<MoveCause, number>> = {};
  let started = 0;

  const lane = (account: string) => {
    const found = lanes.get(account);

    if (found !== undefined) {
      return found;
    }

    const made = { arrived: empty(), left: empty(), started: empty() };

    lanes.set(account, made);

    return made;
  };

  for (const move of moves) {
    const slot = Math.floor((move.at - from) / hour);

    if (slot < 0 || slot >= hours) {
      continue;
    }

    const into = lane(move.to);

    if (move.cause === "start") {
      started += 1;
      into.started[slot] = (into.started[slot] ?? 0) + 1;
      continue;
    }

    moved[move.cause] = (moved[move.cause] ?? 0) + 1;
    into.arrived[slot] = (into.arrived[slot] ?? 0) + 1;

    if (
      move.from !== null &&
      (move.cause === "limit" || move.cause === "over")
    ) {
      const out = lane(move.from);

      out.left[slot] = (out.left[slot] ?? 0) + 1;
    }

    group(groups, move);
  }

  return {
    from,
    lanes: [...lanes].map(([account, counts]) => ({ account, ...counts })),
    moved,
    recent: [...groups.values()].toSorted((a, b) => b.at - a.at).slice(0, 40),
    started,
  };
};

export const threadHref = (row: string) => {
  const [kind, app, ...rest] = row.split(":");
  const id = rest.join(":");

  if (kind !== "t" || id === "") {
    return null;
  }

  if (app === "t3") {
    return `t3-thread://v1/${id}`;
  }

  if (app === "telegram") {
    const [chat = "", topic] = id.split(":");
    const internal = chat.replace(/^-100/u, "");

    return topic === undefined
      ? `https://t.me/c/${internal}`
      : `https://t.me/c/${internal}/${topic}`;
  }

  return null;
};

export const agentSdk = (entrypoint: string) => entrypoint.startsWith("sdk-");

const strength = { blocked: 0, idle: 2, working: 1 } as const;

export const byState = (a: LiveSession, b: LiveSession) =>
  strength[a.state] - strength[b.state] || b.since - a.since;
