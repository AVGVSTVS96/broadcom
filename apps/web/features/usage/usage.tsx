"use client";

import { XIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { SearchInput } from "@/components/ui/search-input";
import { Legend } from "@/components/viz/legend";
import { Section } from "@/components/viz/section";
import { fillOf, Parts, Stack } from "@/features/usage/charts";
import { useNav, UsageNav } from "@/features/usage/nav";
import type { Row, Selected, Usage } from "@/features/usage/read";
import { Segmented } from "@/features/usage/segmented";
import {
  bucketWords,
  groupName,
  groupNames,
  groupPlural,
  listOf,
  presets,
  previousWords,
  rangeNames,
  rangeWords,
  slotWords,
  unitName,
  unitNames,
} from "@/features/usage/words";
import { useLive } from "@/lib/live/client";
import { useSubscription } from "@/lib/outside";
import type { SessionState } from "@/lib/proxy/schema";
import { dollars, when } from "@/lib/time/format";
import { format, isLimit } from "@/lib/usage/usage";
import type { Unit } from "@/lib/usage/usage";
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
  states.get(key) ?? states.get(`session:${key.slice(key.lastIndexOf(":") + 1)}`) ?? null;

const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100).toLocaleString("en")}%` : "–";

const Sdk = ({ share }: { share: number }) =>
  share < 0.05 ? null : (
    <span
      title={`${Math.round(share * 100)}% ran on the Agent SDK or claude -p`}
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

  useSubscription(() => {
    const timer = setTimeout(() => {
      if (text !== value) {
        go({ q: text.trim(), rows: null, sel: null });
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [text, value, go]);

  return (
    <SearchInput
      aria-label="Search names and projects"
      placeholder="Search"
      value={text}
      onChange={(event) => {
        setText(event.currentTarget.value);
      }}
      className="sm:w-64"
    />
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
            go({ range, rows: null, sel: null });
          }}
        />
        <Segmented
          label="Group by"
          value={params.get("by") ?? query.by}
          options={groupNames}
          onChange={(by) => {
            go({ by, rows: null, sel: null, within: null });
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Search />
        {presets.map(([name, patch]) => {
          const pressed =
            patch.q === null ? params.get("w.app") === patch["w.app"] : params.get("q") === patch.q;

          return (
            <Chip
              key={name}
              pressed={pressed}
              onClick={() => {
                go(
                  pressed
                    ? { q: null, rows: null, sel: null, "w.app": null }
                    : { ...patch, rows: null, sel: null },
                );
              }}
            >
              {name}
            </Chip>
          );
        })}
        {query.within === null ? null : (
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
          .filter((filter) => !(filter.dimension === "app" && filter.id === "actions"))
          .map((filter) => (
            <Chip
              key={`${filter.dimension}:${filter.id}`}
              pressed
              onClick={() => {
                const left = query.where[filter.dimension]?.filter((id) => id !== filter.id);

                go({
                  sel: null,
                  [`w.${filter.dimension}`]: left?.join(",") ?? null,
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

const amountOf = (unit: Unit, value: number | null) => {
  const text = format(unit, value);

  if (value === null || !isLimit(unit)) {
    return text;
  }

  const kind = unit === "week" ? "weekly" : "5-hour";

  return value >= 100 ? text.replace("limits", `${kind} limits`) : `${text} of a ${kind} limit`;
};

const readingWords = (unit: Unit) => (unit === "fiveHour" ? "5-hour readings" : "Weekly readings");

const verdictOf = (usage: Usage) => {
  const { unit, q, range } = usage.query;
  const [top] = usage.rows;
  const total = usage.total.values[unit];
  const { coverage } = usage;

  if (q !== "") {
    return `“${q}” used ${amountOf(unit, total)} ${rangeWords[range]}`;
  }

  if (top === undefined) {
    return `No usage ${rangeWords[range]}`;
  }

  if (total === null) {
    return `No ${readingWords(unit).toLowerCase()} ${rangeWords[range]}`;
  }

  if (coverage !== null && coverage.share < 0.5) {
    return `${readingWords(unit)} cover ${coverage.read.length} of ${coverage.active} ${slotWords[usage.size]}s`;
  }

  return `${top.label} led with ${percent(top.values[unit] ?? 0, total)} of ${amountOf(unit, total)} ${rangeWords[range]}`;
};

const evidenceOf = (usage: Usage) => {
  const { unit, by, q } = usage.query;
  const total = usage.total.values[unit] ?? 0;
  const five = usage.rows.slice(0, 5);
  const { coverage, agentSdk } = usage;

  const lead =
    q === ""
      ? `${usage.total.sessions.toLocaleString("en")} sessions; the top ${five.length} ${groupPlural(by)} took ${percent(
          five.reduce((sum, row) => sum + (row.values[unit] ?? 0), 0),
          total,
        )}.`
      : `${usage.rowCount.toLocaleString("en")} ${groupPlural(by)} match.`;

  if (coverage === null || coverage.read.length === coverage.active) {
    return unit === "fiveHour" && agentSdk.fiveHour !== null && agentSdk.share >= 0.05
      ? `${lead} The Agent SDK took ${Math.round(agentSdk.share * 100)}% of spend and ${Math.round(agentSdk.fiveHour * 100)}% of points.`
      : lead;
  }

  const read = coverage.read.length === 0 ? "none" : `${listOf(coverage.read)} only`;

  return coverage.share < 0.5
    ? `Readings on ${read}; the ${dollars(coverage.missing)} spent on the rest has none.`
    : `${lead} Readings on ${read}.`;
};

const tileNote = (usage: Usage, unit: Unit) => {
  const { total, coverage, query } = usage;

  if (unit === "api") {
    const before = total.previous?.api;
    const value = total.values.api;

    return value === null || before === null || before === undefined || before <= 0
      ? null
      : `${value >= before ? "+" : "−"}${percent(Math.abs(value - before), before)} on ${previousWords[query.range]}`;
  }

  if (unit === "tokens") {
    return total.cacheHit === null ? null : `${Math.round(total.cacheHit * 100)}% cache reads`;
  }

  if (unit === "plan") {
    return "Share of plan fees";
  }

  return unit === query.unit && coverage !== null
    ? `Readings on ${coverage.read.length} of ${coverage.active} ${slotWords[usage.size]}s`
    : "Across all plans";
};

const TileValue = ({ unit, value }: { unit: Unit; value: number | null }) => {
  const [number, ...rest] = format(unit, value).split(" ");

  return (
    <div className="flex items-baseline gap-1 truncate">
      <span className="text-3xl tracking-tight tabular-nums sm:text-4xl">{number}</span>
      <span className="text-sm text-muted-foreground">{rest.join(" ")}</span>
    </div>
  );
};

const Tiles = ({ usage }: { usage: Usage }) => {
  const { params, go } = useNav();
  const current = params.get("unit") ?? usage.query.unit;

  return (
    <fieldset className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-5">
      <legend className="sr-only">Unit</legend>
      {unitNames.map(([unit, name], index) => (
        <button
          key={unit}
          type="button"
          aria-pressed={current === unit}
          onClick={() => {
            go({ unit: unit === "api" ? null : unit });
          }}
          className={cn(
            "group min-w-0 space-y-1.5 bg-card p-4 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-pressed:bg-muted sm:p-5",
            index === 0 && "col-span-2 sm:col-span-1",
          )}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground group-aria-pressed:text-foreground">
            <span
              aria-hidden
              className="hidden size-1.5 rounded-full bg-foreground group-aria-pressed:block"
            />
            {name}
          </div>
          <TileValue unit={unit} value={usage.total.values[unit]} />
          <div className="min-h-4 text-xs text-muted-foreground">{tileNote(usage, unit)}</div>
        </button>
      ))}
    </fieldset>
  );
};

const Activity = ({ usage }: { usage: Usage }) => {
  const { unit } = usage.query;
  const missing = usage.readings?.includes("missing") ?? false;

  return (
    <div className="min-w-0 space-y-4">
      <h3 className="text-sm">
        {unitName(unit)}
        <span className="text-muted-foreground"> per {bucketWords[usage.size]}</span>
      </h3>
      <Stack
        layers={usage.selected === null ? usage.layers : usage.layers.slice(0, 1)}
        cells={usage.cells}
        ticks={usage.ticks}
        readings={usage.readings}
        unit={unit}
      />
      {missing ? (
        <Legend
          items={[
            {
              fill: "border border-dotted border-faint",
              key: "box",
              label: "Dotted: no reading",
            },
          ]}
        />
      ) : null}
    </div>
  );
};

const Values = ({ usage, row }: { usage: Usage; row: Row }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
    {unitNames
      .filter(([option]) => option !== usage.query.unit)
      .map(([option, name]) => (
        <div key={option} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{name}</dt>
          <dd className="text-lg tracking-tight">{format(option, row.values[option])}</dd>
        </div>
      ))}
  </dl>
);

const Limits = ({ row }: { row: Selected }) =>
  row.accounts.length === 0 ? null : (
    <div className="space-y-2">
      <h4 className="text-sm">
        By plan
        <span className="text-muted-foreground"> · weekly, 5-hour</span>
      </h4>
      <ul className="space-y-1.5 text-sm">
        {row.accounts.map((account) => (
          <li key={account.name} className="flex items-baseline justify-between gap-3">
            <span className="truncate">{account.name}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {format("week", account.week)} · {format("fiveHour", account.fiveHour)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

const Sessions = ({ usage, row }: { usage: Usage; row: Selected }) => {
  const { go } = useNav();
  const { drill } = row;
  const { unit } = usage.query;

  if (drill === null) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm">
        Sessions
        <span className="text-muted-foreground"> · {drill.count.toLocaleString("en")}</span>
      </h4>
      <ul className="space-y-1.5 text-sm">
        {drill.rows.map((session) => (
          <li
            key={session.key}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3"
          >
            <span className="truncate">{session.label}</span>
            <span className="tabular-nums">{format(unit, session.values[unit])}</span>
            <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
              {when(session.lastActiveAt, usage.now)}
            </span>
          </li>
        ))}
      </ul>
      {drill.count > drill.rows.length ? (
        <button
          type="button"
          onClick={() => {
            go({ by: "session", rows: null, sel: null, within: row.key });
          }}
          className="text-sm underline-offset-4 hover:underline"
        >
          All {drill.count.toLocaleString("en")} sessions
        </button>
      ) : null}
    </div>
  );
};

const Detail = ({ usage, row }: { usage: Usage; row: Selected }) => (
  <div className="space-y-4 rounded-2xl border p-4">
    <p className="text-sm break-words text-muted-foreground">
      {[row.detail, `last active ${when(row.lastActiveAt, usage.now)}`]
        .filter((part) => part !== "")
        .join(" · ")}
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
    <Values usage={usage} row={row} />
    {row.agentSdk < 0.05 ? null : (
      <p className="text-sm text-pretty">
        <span className="text-over">{Math.round(row.agentSdk * 100)}% on the Agent SDK.</span>{" "}
        <span className="text-muted-foreground">
          5-hour limits count it {usage.agentSdk.factor}×.
        </span>
      </p>
    )}
    <Limits row={row} />
    <Sessions usage={usage} row={row} />
  </div>
);

const Line = ({
  usage,
  row,
  rank,
  top,
  state,
  picked,
}: {
  usage: Usage;
  row: Row;
  rank: number | null;
  top: number;
  state: SessionState | null;
  picked: boolean;
}) => {
  const { params, go } = useNav();
  const { unit } = usage.query;
  const value = row.values[unit];
  const fill = fillOf(usage.layers, row.key);
  const next = new URLSearchParams(params);

  if (picked) {
    next.delete("sel");
  } else {
    next.set("sel", row.key);
  }

  return (
    <a
      href={`?${next}`}
      aria-current={picked ? "true" : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          return;
        }

        event.preventDefault();
        go({ sel: picked ? null : row.key });
      }}
      className="-mx-2 grid grid-cols-[1.25rem_minmax(0,1fr)_auto_2.5rem] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring aria-[current]:bg-muted lg:grid-cols-[1.25rem_minmax(0,16rem)_minmax(0,1fr)_minmax(6rem,14rem)_5.5rem_2.5rem]"
    >
      <span className="text-right text-xs text-muted-foreground tabular-nums">{rank}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        {fill === null ? null : (
          <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", fill)} />
        )}
        <span className="truncate">{row.label}</span>
        {state === null ? null : (
          <span
            title={state}
            aria-label={state}
            className={cn("size-1.5 shrink-0 rounded-full", dots[state])}
          />
        )}
        <Sdk share={row.agentSdk} />
      </span>
      <span className="hidden truncate text-xs text-muted-foreground lg:block">
        {[
          row.detail,
          row.sessions > 1 ? `${row.sessions.toLocaleString("en")} sessions` : null,
          when(row.lastActiveAt, usage.now),
        ]
          .filter((part) => part !== null && part !== "")
          .join(" · ")}
      </span>
      <span
        className={cn(
          "col-start-2 row-start-2 h-0.5 rounded-full lg:col-start-4 lg:row-start-1 lg:h-1",
          value === null ? "border-t border-dotted border-faint" : "bg-track",
        )}
      >
        {value === null || top <= 0 ? null : (
          <span
            className={cn("block h-full rounded-full", fill ?? "bg-chart-3")}
            style={{ width: `max(2px, ${(value / top) * 100}%)` }}
          />
        )}
      </span>
      <span className="text-right tabular-nums">{format(unit, value)}</span>
      <span className="text-right text-xs text-muted-foreground tabular-nums">
        {value === null ? "–" : percent(value, usage.total.values[unit] ?? 0)}
      </span>
    </a>
  );
};

const Breakdown = ({ usage }: { usage: Usage }) => {
  const { unit } = usage.query;

  const sums = usage.layers.map((layer) => layer.values.reduce((sum, value) => sum + value, 0));

  const whole = sums.reduce((sum, value) => sum + value, 0);

  return (
    <div className="min-w-0 space-y-4">
      <h3 className="text-sm">Breakdown</h3>
      <Parts layers={usage.layers} label={`${unitName(unit)} by part`} />
      <ul className="space-y-4">
        {usage.layers.map((layer, index) => {
          const sum = sums[index] ?? 0;

          return (
            <li key={layer.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-[2px]", fillOf(usage.layers, layer.key))}
                  />
                  <span className="truncate">{layer.label}</span>
                </span>
                <span className="shrink-0 tabular-nums">{format(unit, sum)}</span>
              </div>
              <div className="h-1 rounded-full bg-track">
                <div
                  className={cn("h-full rounded-full", fillOf(usage.layers, layer.key))}
                  style={{
                    width: `${whole > 0 ? (sum / whole) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="text-right text-xs text-muted-foreground tabular-nums">
                {percent(sum, whole)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const more = 50;

const Ranking = ({ usage }: { usage: Usage }) => {
  const { go } = useNav();
  const states = useLiveRows();
  const { unit } = usage.query;
  const { selected } = usage;
  const pinned = selected?.pinned === true;

  const shown = pinned && selected !== null ? [selected, ...usage.rows] : usage.rows;

  const top = Math.max(0, ...shown.map((row) => row.values[unit] ?? 0));

  return (
    <div className="min-w-0 space-y-2 border-t pt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm">{groupName(usage.query.by)}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {usage.rows.length < usage.rowCount
            ? `${usage.rows.length} of ${usage.rowCount.toLocaleString("en")}`
            : usage.rowCount.toLocaleString("en")}
        </span>
      </div>
      <ul>
        {shown.map((row, index) => (
          <li key={row.key} className={cn(pinned && index === 0 && "mb-2 border-b pb-2")}>
            <Line
              usage={usage}
              row={row}
              rank={pinned && index === 0 ? null : index + (pinned ? 0 : 1)}
              top={top}
              state={stateOf(states, row.key)}
              picked={selected?.key === row.key}
            />
            {selected?.key === row.key ? (
              <div className="py-2">
                <Detail usage={usage} row={selected} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {usage.rowCount > usage.rows.length ? (
        <button
          type="button"
          onClick={() => {
            go({ rows: String(usage.rows.length + more) });
          }}
          className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Show {Math.min(more, usage.rowCount - usage.rows.length)} more
        </button>
      ) : null}
    </div>
  );
};

const Body = ({ usage }: { usage: Usage }) => (
  <>
    <Toolbar usage={usage} />
    <Section title={verdictOf(usage)} detail={evidenceOf(usage)}>
      <div className="space-y-6">
        <Tiles usage={usage} />
        {usage.rows.length === 0 && usage.selected === null ? (
          <p className="py-10 text-center text-muted-foreground">Nothing matches.</p>
        ) : (
          <>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
              <Activity usage={usage} />
              <div className="border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
                <Breakdown usage={usage} />
              </div>
            </div>
            <Ranking usage={usage} />
          </>
        )}
      </div>
    </Section>
  </>
);

export const UsageView = ({ usage }: { usage: Usage }) => (
  <UsageNav>
    <Body usage={usage} />
  </UsageNav>
);
