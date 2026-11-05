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

export interface Bounce {
  readonly at: number;
  readonly label: string | null;
  readonly count: number;
  readonly between: readonly string[];
}

export interface Handoffs {
  readonly from: number;
  readonly bounce: Bounce | null;
  readonly lanes: readonly Lane[];
  readonly recent: readonly Handoff[];
  readonly started: number;
  readonly moved: Readonly<Partial<Record<MoveCause, number>>>;
}

const hours = 24;

const empty = () => Array.from({ length: hours }, () => 0);

const group = (groups: Map<string, Handoff>, move: Move) => {
  const key = `${move.from} ${move.to} ${move.cause}`;
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

const bounceAt = 6;

const burstOf = (moves: readonly Move[]) => {
  let best = { from: 0, to: 0 };
  let from = 0;

  for (const [to, move] of moves.entries()) {
    while ((moves[from]?.at ?? move.at) < move.at - hour) {
      from += 1;
    }

    if (to + 1 - from > best.to - best.from) {
      best = { from, to: to + 1 };
    }
  }

  return moves.slice(best.from, best.to);
};

const bounceOf = (moves: readonly Move[], now: number): Bounce | null => {
  const bySession = Map.groupBy(
    moves
      .filter((move) => move.cause !== "start" && now - move.at <= span)
      .toSorted((a, b) => a.at - b.at),
    (move) => move.session
  );

  const [burst] = [...bySession.values()]
    .map(burstOf)
    .toSorted((a, b) => b.length - a.length);

  const last = burst?.at(-1);

  if (burst === undefined || last === undefined || burst.length < bounceAt) {
    return null;
  }

  return {
    at: last.at,
    between: [
      ...new Set(
        burst.flatMap((move) =>
          move.from === null ? [move.to] : [move.from, move.to]
        )
      ),
    ],
    count: burst.length,
    label: last.label,
  };
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
    bounce: bounceOf(moves, now),
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

export const waiting = (sessions: readonly LiveSession[]) =>
  sessions.filter(
    (session) =>
      session.state === "blocked" &&
      session.account !== null &&
      !sessions.some(
        (newer) =>
          newer.row === session.row &&
          newer.label === session.label &&
          newer.since > session.since
      )
  );
