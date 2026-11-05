"use client";

import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Section } from "@/components/viz/section";
import { Columns, Multiples } from "@/features/usage/charts";
import { useNav, UsageNav } from "@/features/usage/nav";
import type { Row, Usage } from "@/features/usage/read";
import { Segmented } from "@/features/usage/segmented";
import {
  bucketWords,
  cellWords,
  groupNames,
  groupPlural,
  presets,
  previousWords,
  rangeNames,
  rangeWords,
  unitName,
  unitNames,
  unitNotes,
} from "@/features/usage/words";
import { useLive } from "@/lib/live/client";
import { day, when } from "@/lib/model/time";
import { format, sumCells } from "@/lib/model/usage";
import type { SessionState } from "@/lib/proxy/schema";
import { cn } from "@/lib/utils";

const strength = { blocked: 3, idle: 1, working: 2 } as const;

const dots = {
  blocked: "bg-over",
  idle: "bg-faint",
  working: "bg-ok",
} as const satisfies Record<SessionState, string>;

const useLiveRows = () => {
  const sessions = useLive((live) => live.sessions);
  const states = new Map<string, SessionState>();

  for (const session of Object.values(sessions)) {
    for (const key of [session.row, `session:${session.id}`]) {
      const seen = states.get(key);

      if (seen === undefined || strength[session.state] > strength[seen]) {
        states.set(key, session.state);
      }
    }
  }

  return states;
};

const stateOf = (states: ReadonlyMap<string, SessionState>, key: string) =>
  states.get(key) ??
  states.get(`session:${key.slice(key.lastIndexOf(":") + 1)}`) ??
  null;

const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–";

const Sdk = ({ share, factor }: { share: number; factor: number }) =>
  share < 0.05 ? null : (
    <span
      title={`${Math.round(share * 100)}% ran on the Agent SDK or claude -p; five-hour limits count it ${factor}×`}
      className="shrink-0 rounded-[5px] border border-over/50 px-1 text-[10px] leading-4 font-medium tracking-wide text-over"
    >
      SDK{share < 0.95 ? ` ${Math.round(share * 100)}%` : ""}
    </span>
  );

const Search = () => {
  const { params, go } = useNav();
  const value = params.get("q") ?? "";
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);

  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== value) {
        go({ all: null, q: text.trim(), sel: null });
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [text, value, go]);

  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-full bg-muted px-3 text-sm sm:w-64">
      <SearchIcon aria-hidden className="size-4 text-muted-foreground" />
      <input
        type="search"
        aria-label="Search names and projects"
        placeholder="Search"
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
        }}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
};

const Chip = ({
  pressed,
  onClick,
  children,
}: {
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground/30 aria-pressed:bg-card aria-pressed:text-foreground"
  >
    {children}
  </button>
);

const Toolbar = ({ usage }: { usage: Usage }) => {
  const { params, go } = useNav();
  const { query } = usage;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Range"
          value={params.get("range") ?? query.range}
          options={rangeNames}
          onChange={(range) => {
            go({ all: null, range, sel: null });
          }}
        />
        <Segmented
          label="Group by"
          value={params.get("by") ?? query.by}
          options={groupNames}
          onChange={(by) => {
            go({ all: null, by, sel: null, within: null });
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Search />
        {presets.map(([name, patch]) => {
          const pressed =
            patch.q === null
              ? params.get("w.app") === patch["w.app"]
              : params.get("q") === patch.q;

          return (
            <Chip
              key={name}
              pressed={pressed}
              onClick={() => {
                go(
                  pressed
                    ? { all: null, q: null, sel: null, "w.app": null }
                    : { ...patch, all: null, sel: null }
                );
              }}
            >
              {name}
            </Chip>
          );
        })}
        {usage.query.within === null ? null : (
          <Chip
            pressed
            onClick={() => {
              go({ sel: null, within: null });
            }}
          >
            Sessions of {usage.owner ?? "one agent"}
            <XIcon aria-label="Remove" className="size-3.5" />
          </Chip>
        )}
        {usage.filters
          .filter(
            (filter) => !(filter.dimension === "app" && filter.id === "actions")
          )
          .map((filter) => (
            <Chip
              key={`${filter.dimension}:${filter.id}`}
              pressed
              onClick={() => {
                const rest = query.where[filter.dimension]?.filter(
                  (id) => id !== filter.id
                );

                go({
                  sel: null,
                  [`w.${filter.dimension}`]: rest?.join(",") ?? null,
                });
              }}
            >
              {filter.label}
              <XIcon aria-label="Remove" className="size-3.5" />
            </Chip>
          ))}
      </div>
    </div>
  );
};

const verdictOf = (usage: Usage) => {
  const { unit, q, range } = usage.query;
  const [top] = usage.rows;
  const total = usage.total.values[unit];

  if (q !== "") {
    return `“${q}” used ${format(unit, total)} ${rangeWords[range]}`;
  }

  if (top === undefined) {
    return `No usage ${rangeWords[range]}`;
  }

  if (total === null) {
    return `No limit readings ${rangeWords[range]}`;
  }

  return `${top.label} led with ${percent(top.values[unit] ?? 0, total)} of ${format(unit, total)} ${rangeWords[range]}`;
};

const evidenceOf = (usage: Usage) => {
  const { unit, by, q } = usage.query;
  const total = usage.total.values[unit] ?? 0;
  const five = usage.rows.slice(0, 5);

  const share = percent(
    five.reduce((sum, row) => sum + (row.values[unit] ?? 0), 0),
    total
  );

  const lead =
    q === ""
      ? `The top ${five.length} ${groupPlural(by)} took ${share}.`
      : `${usage.rowCount.toLocaleString("en")} ${groupPlural(by)} match.`;

  return `${lead} ${unitNotes[unit].replace("{factor}", String(usage.agentSdk.factor))}`;
};

const allLabel = (usage: Usage) => {
  if (usage.query.q !== "") {
    return `All matches`;
  }

  if (usage.query.within !== null) {
    return `All of ${usage.owner ?? "this agent"}`;
  }

  return `All ${groupPlural(usage.query.by)}`;
};

const Line = ({
  name,
  sub,
  value,
  share,
  series,
  usage,
  ink,
  selected,
  href,
  onPick,
  badge,
}: {
  name: ReactNode;
  sub: ReactNode;
  value: string;
  share: string;
  series: readonly number[];
  usage: Usage;
  ink: boolean;
  selected: boolean;
  href: string;
  onPick: () => void;
  badge?: ReactNode;
}) => (
  <a
    href={href}
    aria-current={selected ? "true" : undefined}
    onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        return;
      }

      event.preventDefault();
      onPick();
    }}
    className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2.5 rounded-2xl px-3 py-3 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring aria-[current]:bg-muted lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_6.5rem] lg:items-center"
  >
    <div className="min-w-0 space-y-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "truncate",
            ink || selected ? "font-medium" : "text-foreground/90"
          )}
        >
          {name}
        </span>
        {badge}
      </div>
      <div className="truncate text-xs text-muted-foreground">{sub}</div>
    </div>
    <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
      <Multiples
        series={series}
        cells={usage.cells}
        unit={usage.query.unit}
        ink={ink || selected}
      />
    </div>
    <div className="col-start-2 row-start-1 text-right lg:col-start-3">
      <div className="tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground tabular-nums">{share}</div>
    </div>
  </a>
);

const Heading = ({ usage, row }: { usage: Usage; row: Row | null }) => {
  const { go } = useNav();

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-lg font-medium tracking-tight break-words">
          {row?.label ?? allLabel(usage)}
        </h3>
        {row === null ? null : (
          <button
            type="button"
            aria-label="Close"
            onClick={() => {
              go({ sel: null });
            }}
            className="-mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
      {row === null ? null : (
        <p className="text-sm break-words text-muted-foreground">
          {row.detail}
          {row.href === null ? null : (
            <>
              {" · "}
              <a
                href={row.href}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Open
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
};

const changeOf = (value: number | null, before: number | null | undefined) =>
  value === null || before === null || before === undefined || before <= 0
    ? null
    : `${value >= before ? "+" : "−"}${percent(Math.abs(value - before), before)}`;

const Figure = ({ usage, row }: { usage: Usage; row: Row | null }) => {
  const { unit, range } = usage.query;
  const value = (row?.values ?? usage.total.values)[unit];
  const total = usage.total.values[unit] ?? 0;

  const change =
    row === null ? changeOf(value, usage.total.previous?.[unit]) : null;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl tracking-tight">{format(unit, value)}</span>
        <span className="text-sm text-muted-foreground">{unitName(unit)}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {row === null
          ? `${usage.total.sessions.toLocaleString("en")} sessions ${rangeWords[range]}`
          : `${percent(value ?? 0, total)} of all, last active ${when(row.lastActiveAt, usage.now)}`}
        {change === null ? null : `. ${change} on ${previousWords[range]}`}
      </p>
    </div>
  );
};

const Agents = ({ usage, row }: { usage: Usage; row: Row | null }) => {
  const sdk = row?.agentSdk ?? usage.agentSdk.share;
  const points = usage.agentSdk.fiveHour;

  if (sdk < 0.05) {
    return null;
  }

  return (
    <p className="text-sm text-pretty">
      <span className="font-medium text-over">
        {Math.round(sdk * 100)}% on the Agent SDK.
      </span>{" "}
      <span className="text-muted-foreground">
        Five-hour limits count it {usage.agentSdk.factor}×
        {row === null && points !== null
          ? `, so it took ${Math.round(points * 100)}% of five-hour points`
          : ""}
        .
      </span>
    </p>
  );
};

const Accounts = ({ row }: { row: Row }) =>
  row.accounts.length === 0 ? null : (
    <div className="space-y-2.5">
      <h4 className="text-sm">
        Limits by account
        <span className="text-muted-foreground"> · week, 5 h</span>
      </h4>
      <ul className="space-y-1.5 text-sm">
        {row.accounts.map((account) => (
          <li
            key={account.name}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="truncate">{account.name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {format("week", account.week)} ·{" "}
              {format("fiveHour", account.fiveHour)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

const Sessions = ({ usage, row }: { usage: Usage; row: Row }) => {
  const { go } = useNav();
  const { drill } = usage;
  const { unit } = usage.query;

  if (drill === null) {
    return null;
  }

  return (
    <div className="space-y-2.5">
      <h4 className="text-sm">
        Sessions
        <span className="text-muted-foreground">
          {" "}
          · {drill.count.toLocaleString("en")}
        </span>
      </h4>
      <ul className="space-y-1.5 text-sm">
        {drill.rows.map((session) => (
          <li
            key={session.key}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3"
          >
            <span className="truncate">{session.label}</span>
            <span className="tabular-nums">
              {format(unit, session.values[unit])}
            </span>
            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
              {when(session.lastActiveAt, usage.now)}
            </span>
          </li>
        ))}
      </ul>
      {drill.count > drill.rows.length ? (
        <button
          type="button"
          onClick={() => {
            go({ by: "session", sel: null, within: row.key });
          }}
          className="text-sm underline-offset-4 hover:underline"
        >
          All {drill.count.toLocaleString("en")} sessions
        </button>
      ) : null}
    </div>
  );
};

const Detail = ({ usage, row }: { usage: Usage; row: Row | null }) => {
  const { unit } = usage.query;
  const values = row?.values ?? usage.total.values;
  const series = row?.series ?? usage.total.series;

  return (
    <div className="space-y-5">
      <Heading usage={usage} row={row} />
      <Figure usage={usage} row={row} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y py-4">
        {unitNames
          .filter(([option]) => option !== unit)
          .map(([option]) => (
            <div key={option} className="min-w-0">
              <dt className="text-xs text-muted-foreground">
                {unitName(option)}
              </dt>
              <dd className="text-lg tracking-tight">
                {format(option, values[option])}
              </dd>
            </div>
          ))}
      </dl>
      <Agents usage={usage} row={row} />
      <div className="space-y-3">
        <h4 className="text-sm">
          {unitName(unit)} per {cellWords[usage.size]}
          <span className="text-muted-foreground"> · dashed: average</span>
        </h4>
        <Columns
          values={sumCells(series, usage.cells)}
          cells={usage.cells}
          unit={unit}
        />
      </div>
      {row === null ? null : <Accounts row={row} />}
      {row === null ? null : <Sessions usage={usage} row={row} />}
    </div>
  );
};

const Ranking = ({ usage }: { usage: Usage }) => {
  const { params, go } = useNav();
  const states = useLiveRows();
  const { unit } = usage.query;
  const sel = params.get("sel");
  const total = usage.total.values[unit] ?? 0;

  const selected =
    usage.rows.find((row) => row.key === usage.query.sel) ?? null;

  const hrefOf = (key: string | null) => {
    const next = new URLSearchParams(params);

    if (key === null) {
      next.delete("sel");
    } else {
      next.set("sel", key);
    }

    return `?${next}`;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
      <div className="min-w-0">
        <div className="-mx-3 hidden grid-cols-[minmax(0,12rem)_minmax(0,1fr)_6.5rem] gap-x-4 px-3 pb-2 text-xs text-muted-foreground lg:grid">
          <span>
            {groupNames.find(([option]) => option === usage.query.by)?.[1]}
          </span>
          <div
            className="grid gap-2.5"
            style={{
              gridTemplateColumns: `repeat(${usage.cells.length}, minmax(0, 1fr))`,
            }}
          >
            {usage.cells.map((cell) => (
              <span
                key={cell.from}
                className={cn(
                  "truncate",
                  cell.now !== null && "text-foreground"
                )}
              >
                {cell.label}
              </span>
            ))}
          </div>
          <span className="text-right">{unitName(unit)}</span>
        </div>
        <div className="-mx-3 space-y-0.5">
          <div
            className="grid gap-1.5 px-3 pb-1 text-[11px] text-muted-foreground lg:hidden"
            style={{
              gridTemplateColumns: `repeat(${usage.cells.length}, minmax(0, 1fr))`,
            }}
          >
            {usage.cells.map((cell) => (
              <span
                key={cell.from}
                className={cn(
                  "whitespace-nowrap",
                  cell.now !== null && "text-foreground"
                )}
              >
                {cell.label}
              </span>
            ))}
          </div>
          <Line
            name={allLabel(usage)}
            sub={`${usage.total.sessions.toLocaleString("en")} sessions`}
            value={format(unit, usage.total.values[unit])}
            share="100%"
            series={usage.total.series}
            usage={usage}
            ink
            selected={sel === null}
            href={hrefOf(null)}
            onPick={() => {
              go({ sel: null });
            }}
          />
          {usage.rows.map((row) => {
            const state = stateOf(states, row.key);
            const picked = sel === row.key;

            return (
              <div key={row.key}>
                <Line
                  name={row.label}
                  sub={[
                    row.detail,
                    row.sessions > 1
                      ? `${row.sessions.toLocaleString("en")} sessions`
                      : null,
                    when(row.lastActiveAt, usage.now),
                  ]
                    .filter((part) => part !== null && part !== "")
                    .join(" · ")}
                  value={format(unit, row.values[unit])}
                  share={percent(row.values[unit] ?? 0, total)}
                  series={row.series}
                  usage={usage}
                  ink={false}
                  selected={picked}
                  href={hrefOf(picked ? null : row.key)}
                  onPick={() => {
                    go({ sel: picked ? null : row.key });
                  }}
                  badge={
                    <>
                      {state === null ? null : (
                        <span
                          title={state}
                          aria-label={state}
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            dots[state]
                          )}
                        />
                      )}
                      <Sdk
                        share={row.agentSdk}
                        factor={usage.agentSdk.factor}
                      />
                    </>
                  }
                />
                {picked && selected?.key === row.key ? (
                  <div className="mx-3 my-3 rounded-2xl border p-4 lg:hidden">
                    <Detail usage={usage} row={selected} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Each row on its own scale. Bars: {unitName(unit)} per{" "}
            {bucketWords[usage.size]}; dashed: its average; line: now.
            {(unit === "week" || unit === "fiveHour") &&
            usage.limitsSince !== null
              ? ` Limit readings since ${day(usage.limitsSince)}.`
              : ""}
          </span>
          {usage.rowCount > usage.rows.length ? (
            <button
              type="button"
              onClick={() => {
                go({ all: "1" });
              }}
              className="rounded-full border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              Show all {usage.rowCount.toLocaleString("en")}
            </button>
          ) : null}
        </div>
      </div>
      <div className="border-t pt-5 lg:hidden">
        <Detail usage={usage} row={null} />
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-6 border-l pl-8">
          <Detail usage={usage} row={selected} />
        </div>
      </aside>
    </div>
  );
};

const Body = ({ usage }: { usage: Usage }) => {
  const { params, go } = useNav();

  return (
    <>
      <Toolbar usage={usage} />
      <Section
        title={verdictOf(usage)}
        detail={evidenceOf(usage)}
        actions={
          <Segmented
            label="Unit"
            value={params.get("unit") ?? usage.query.unit}
            options={unitNames}
            onChange={(unit) => {
              go({ unit });
            }}
          />
        }
      >
        {usage.rows.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            {usage.query.q === "" && usage.filters.length === 0
              ? `No usage ${rangeWords[usage.query.range]}.`
              : "Nothing matches."}
          </p>
        ) : (
          <Ranking usage={usage} />
        )}
      </Section>
    </>
  );
};

export const UsageView = ({ usage }: { usage: Usage }) => (
  <UsageNav>
    <Body usage={usage} />
  </UsageNav>
);
