"use client";

import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Legend } from "@/components/viz/legend";
import { Section } from "@/components/viz/section";
import type { LiveData } from "@/features/live/read";
import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import { duration, plural, when } from "@/lib/model/format";
import { agentSdk, byState, threadHref, waiting } from "@/lib/model/live";
import type { Handoff, Handoffs } from "@/lib/model/live";
import { nameOf, namesOf } from "@/lib/model/names";
import type {
  Account,
  LiveSession,
  MoveCause,
  SessionState,
} from "@/lib/proxy/schema";
import { cn } from "@/lib/utils";

const dots = {
  blocked: "bg-over",
  idle: "bg-faint",
  working: "bg-ok",
} as const satisfies Record<SessionState, string>;

const apps = new Map([
  ["buzz", "Buzz"],
  ["discord", "Discord"],
  ["t3", "T3 Code"],
  ["telegram", "Telegram"],
  ["voice", "Voice"],
]);

const appName = (app: string | null) => apps.get(app ?? "") ?? "Job";

const rankIn = (order: readonly string[], id: string | null) => {
  const at = id === null ? -1 : order.indexOf(id);

  return at === -1 ? order.length : at;
};

const moveCauses = ["limit", "over", "early", "restart", "other"] as const;

const causes = {
  early: "moved early",
  limit: "hit a limit",
  other: "moved",
  over: "passed its cutoff",
  restart: "restarted",
  start: "started",
} as const satisfies Record<MoveCause, string>;

const home = (cwd: string) =>
  cwd.replace(/^\/(?:home|Users)\/[^/]+/u, "~") || "~";

const useNames = (data: LiveData) => {
  const accounts = useLive((live) => live.accounts);

  const named = namesOf(
    Object.values(accounts).map((account) => ({
      id: account.id,
      label: account.label,
    })),
    data.grants
  );

  return (id: string | null) => nameOf(named, id);
};

const listOf = (items: readonly string[]) =>
  new Intl.ListFormat("en", { type: "conjunction" }).format(items);

type Name = ReturnType<typeof useNames>;

const Dot = ({ state }: { state: SessionState }) => (
  <span
    title={state}
    className={cn("size-2 shrink-0 rounded-full", dots[state])}
  >
    <span className="sr-only">{state}</span>
  </span>
);

const Entry = ({ entrypoint }: { entrypoint: string }) =>
  agentSdk(entrypoint) ? (
    <span
      title="Agent SDK or claude -p: 5-hour limits count it more"
      className="shrink-0 rounded-[5px] border border-over/50 px-1 text-[10px] leading-4 font-medium tracking-wide text-over"
    >
      SDK
    </span>
  ) : null;

const Open = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
  >
    {children}
    <ArrowUpRightIcon aria-hidden className="size-3" />
  </a>
);

const usageHref = (row: string) =>
  `/usage?range=30d&sel=${encodeURIComponent(row)}`;

const Waiting = ({
  sessions,
  name,
  now,
}: {
  sessions: readonly LiveSession[];
  name: Name;
  now: number;
}) => {
  const asking = waiting(sessions).toSorted((a, b) => a.since - b.since);
  const [oldest] = asking;

  if (oldest === undefined) {
    return null;
  }

  return (
    <Section
      title={`${plural(asking.length, "session waits", "sessions wait")} on you, the oldest for ${duration(now - oldest.since)}`}
    >
      <ul className="-mx-2 divide-y">
        {asking.toReversed().map((session) => {
          const href = threadHref(session.row);

          return (
            <li
              key={session.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-2 py-3"
            >
              <Dot state="blocked" />
              <div className="min-w-0">
                <Link
                  href={usageHref(session.row)}
                  className="block truncate underline-offset-4 hover:underline"
                >
                  {session.label}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  {[
                    appName(session.app),
                    session.account === null ? null : name(session.account),
                    home(session.cwd),
                  ]
                    .filter((part) => part !== null)
                    .join(" · ")}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {duration(now - session.since)}
                </span>
                {href === null ? null : <Open href={href}>Open</Open>}
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
};

const SessionLine = ({
  session,
  now,
}: {
  session: LiveSession;
  now: number;
}) => {
  const href = threadHref(session.row);

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 py-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,14rem)_4.5rem]">
      <Dot state={session.state} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href={usageHref(session.row)}
            className="truncate underline-offset-4 hover:underline"
          >
            {session.label}
          </Link>
          <Entry entrypoint={session.entrypoint} />
          {href === null ? null : (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${session.label}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowUpRightIcon className="size-3.5" />
            </a>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground sm:hidden">
          {appName(session.app)} · {session.host} · {home(session.cwd)}
        </div>
      </div>
      <div className="hidden truncate text-xs text-muted-foreground sm:block">
        {appName(session.app)} · {session.host} · {home(session.cwd)}
      </div>
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {duration(now - session.since)}
      </span>
    </li>
  );
};

const AccountLane = ({
  account,
  label,
  sessions,
  most,
  next,
  now,
}: {
  account: Account | null;
  label: string;
  sessions: readonly LiveSession[];
  most: number;
  next: boolean;
  now: number;
}) => {
  const working = sessions.filter((session) => session.state === "working");
  const idle = sessions.length - working.length;

  return (
    <div className="space-y-3 max-sm:border-t max-sm:pt-4 max-sm:first:border-t-0 max-sm:first:pt-0 sm:rounded-2xl sm:border sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate font-medium">{label}</h3>
          {account === null || account.plan === "" ? null : (
            <span className="text-sm text-muted-foreground">
              {account.plan}
            </span>
          )}
          {next ? (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">
              Next
            </span>
          ) : null}
        </div>
        <div className="flex items-baseline gap-1.5 text-sm">
          <span className="text-2xl tracking-tight">{working.length}</span>
          <span className="text-muted-foreground">working · {idle} idle</span>
        </div>
      </div>
      <div className="flex h-2 gap-0.5" aria-hidden>
        <span
          className="rounded-full bg-foreground"
          style={{ width: `${(working.length / most) * 100}%` }}
        />
        <span
          className="rounded-full bg-chart-4"
          style={{ width: `${(idle / most) * 100}%` }}
        />
      </div>
      <ul className="divide-y">
        {sessions.map((session) => (
          <SessionLine key={session.id} session={session} now={now} />
        ))}
      </ul>
    </div>
  );
};

const Running = ({
  sessions,
  name,
  now,
}: {
  sessions: readonly LiveSession[];
  name: Name;
  now: number;
}) => {
  const accounts = useLive((live) => live.accounts);
  const pool = useLive((live) => live.pool);
  const order = pool?.order ?? [];
  const groups = Map.groupBy(sessions, (session) => session.account);

  const lanes = [...groups]
    .map(([id, list]) => ({
      account: id === null ? null : (accounts[id] ?? null),
      id,
      sessions: list.toSorted(byState),
    }))
    .toSorted((a, b) => rankIn(order, a.id) - rankIn(order, b.id));

  const working = sessions.filter((session) => session.state === "working");
  const sdk = sessions.filter((session) => agentSdk(session.entrypoint));
  const hosts = [...new Set(sessions.map((session) => session.host))];
  const most = Math.max(1, ...lanes.map((lane) => lane.sessions.length));

  const [busiest] = lanes.toSorted(
    (a, b) => b.sessions.length - a.sessions.length
  );

  const title =
    sessions.length === 0
      ? "Nothing is running"
      : `${plural(working.length, "session")} working, ${sessions.length - working.length} idle${
          lanes.length === 1 && busiest !== undefined
            ? `, all on ${name(busiest.id)}`
            : ` on ${lanes.length} accounts`
        }`;

  return (
    <Section
      title={title}
      detail={
        [
          sdk.length === 0
            ? null
            : `${sdk.length} on the Agent SDK or claude -p.`,
          hosts.length > 1 ? `On ${listOf(hosts)}.` : null,
        ]
          .filter((part) => part !== null)
          .join(" ") || undefined
      }
    >
      <div className={cn("grid gap-3", lanes.length > 1 && "xl:grid-cols-2")}>
        {lanes.map((lane) => (
          <AccountLane
            key={lane.id ?? "none"}
            account={lane.account}
            label={name(lane.id)}
            sessions={lane.sessions}
            most={most}
            next={lane.id !== null && lane.id === pool?.next}
            now={now}
          />
        ))}
      </div>
    </Section>
  );
};

const shades = [
  "bg-track/60",
  "bg-foreground/15",
  "bg-foreground/30",
  "bg-foreground/50",
  "bg-foreground/75",
] as const;

const shadeOf = (count: number, peak: number) =>
  count <= 0 ? 0 : Math.max(1, Math.ceil(Math.sqrt(count / peak) * 4));

const hour = 3_600_000;

const hourClock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

const Group = ({
  group,
  name,
  now,
}: {
  group: Handoff;
  name: Name;
  now: number;
}) => {
  const shown = group.labels.slice(0, 2);
  const more = group.labels.length - shown.length;

  return (
    <li className="space-y-0.5 py-2.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate">
          {group.from === null ? "" : `${name(group.from)} → `}
          {name(group.to)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {when(group.at, now)}
        </span>
      </div>
      <div className="truncate text-xs text-muted-foreground">
        <span
          className={cn(
            group.cause === "limit" || group.cause === "over"
              ? "text-bad"
              : "text-foreground"
          )}
        >
          {group.count > 1 ? `${group.count}× ` : ""}
          {causes[group.cause]}
        </span>
        {shown.length === 0
          ? null
          : ` · ${shown.join(", ")}${more > 0 ? ` +${more}` : ""}`}
      </div>
    </li>
  );
};

const between = (
  ids: readonly string[],
  name: Name,
  keys: ReadonlySet<string>
) => {
  const plans = ids.flatMap((id) => (keys.has(id) ? [] : [name(id)]));
  const apiKeys = ids.length - plans.length;

  return listOf([
    ...plans,
    ...(apiKeys === 0 ? [] : [plural(apiKeys, "API key")]),
  ]);
};

const limitTitle = (limit: number) =>
  limit === 0
    ? "No session had to change account in 24 hours"
    : `${plural(limit, "move")} off a limit in 24 hours`;

const Moves = ({
  moves,
  name,
  keys,
  now,
}: {
  moves: Handoffs;
  name: Name;
  keys: ReadonlySet<string>;
  now: number;
}) => {
  const accounts = useLive((live) => live.accounts);
  const pool = useLive((live) => live.pool);
  const order = pool?.order ?? [];

  const lanes = moves.lanes.toSorted(
    (a, b) => rankIn(order, a.account) - rankIn(order, b.account)
  );

  const peak = Math.max(
    1,
    ...lanes.flatMap((lane) =>
      lane.started.map((count, index) => count + (lane.arrived[index] ?? 0))
    )
  );

  const limit = (moves.moved.limit ?? 0) + (moves.moved.over ?? 0);
  const { bounce } = moves;

  const moved = moveCauses
    .flatMap((cause) => {
      const count = moves.moved[cause] ?? 0;

      return count === 0
        ? []
        : [`${count.toLocaleString("en")} ${causes[cause]}`];
    })
    .join(", ");

  const counts = `${plural(moves.started, "session")} started${moved === "" ? "" : `; ${moved}`} in 24 hours.`;
  const over = bounce !== null && now - bounce.at > hour;

  const title = () => {
    if (bounce === null) {
      return limitTitle(limit);
    }

    const who = `${bounce.label ?? "One session"} moved ${bounce.count} times`;

    return over
      ? `${who} in an hour, until ${when(bounce.at, now)}`
      : `${who} in an hour, between ${between(bounce.between, name, keys)}`;
  };

  const detail = over
    ? `Between ${between(bounce.between, name, keys)}. ${counts}`
    : counts;

  const marks = [0, 6, 12, 18].map((offset) => moves.from + offset * 3_600_000);

  return (
    <Section title={title()} detail={detail}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-y-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-4">
            <span className="hidden sm:block" />
            <div className="grid grid-cols-4 text-[11px] text-muted-foreground">
              {marks.map((at) => (
                <span key={at}>{hourClock.format(at)}</span>
              ))}
            </div>
            {lanes.map((lane) => {
              const started = lane.started.reduce(
                (sum, count) => sum + count,
                0
              );

              return (
                <div key={lane.account} className="contents">
                  <div className="min-w-0 sm:pt-0.5">
                    <div className="truncate text-sm">{name(lane.account)}</div>
                    <div className="text-xs text-muted-foreground">
                      {accounts[lane.account]?.plan ?? ""}
                      {accounts[lane.account]?.plan ? " · " : ""}
                      {started.toLocaleString("en")} started
                    </div>
                  </div>
                  <div className="grid grid-cols-24 gap-0.5">
                    {lane.started.map((count, index) => {
                      const arrived = lane.arrived[index] ?? 0;
                      const left = lane.left[index] ?? 0;
                      const at = moves.from + index * 3_600_000;

                      return (
                        <span
                          key={at}
                          title={`${hourClock.format(at)}: ${count} started, ${arrived} moved in, ${left} moved off a limit`}
                          className={cn(
                            "relative flex h-7 items-center justify-center rounded-[3px]",
                            shades[shadeOf(count + arrived, peak)]
                          )}
                        >
                          {left > 0 ? (
                            <span className="size-2 rounded-full bg-bad ring-2 ring-card" />
                          ) : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <Legend
            items={[
              { key: "box", label: "Sessions per hour" },
              { key: "dot", label: "Moved off a limit" },
            ]}
          />
        </div>
        <div className="min-w-0 lg:border-l lg:pl-8">
          <h3 className="text-sm">Moves by route</h3>
          {moves.recent.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="divide-y">
              {moves.recent.slice(0, 8).map((group) => (
                <Group
                  key={`${group.at} ${group.from} ${group.to}`}
                  group={group}
                  name={name}
                  now={now}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
};

export const LiveView = ({ data }: { data: LiveData }) => {
  const now = useNow(data.now);
  const name = useNames(data);
  const sessions = Object.values(useLive((live) => live.sessions));
  const running = sessions.filter((session) => session.state !== "blocked");
  const keys = new Set(data.grants.map((grant) => grant.credentialId));

  return (
    <div className="space-y-5">
      <Running sessions={running} name={name} now={now} />
      <Waiting sessions={sessions} name={name} now={now} />
      {data.handoffs === null ? (
        <Section title="Moves are unavailable">
          <p className="text-sm text-muted-foreground">
            The proxy didn&apos;t answer for its account history.
          </p>
        </Section>
      ) : (
        <Moves moves={data.handoffs} name={name} keys={keys} now={now} />
      )}
    </div>
  );
};
