import "server-only";
import { Effect } from "effect";
import { connection } from "next/server";

import {
  accountNames,
  cellsOf,
  groupings,
  oneOf,
  ranges,
  sumSeries,
  units,
  valuesOf,
} from "@/lib/model/usage";
import type { Cell, Grouping, Range, Unit, Values } from "@/lib/model/usage";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import { Credits, UsageView } from "@/lib/proxy/schema";
import type { BucketSize, UsageRow } from "@/lib/proxy/schema";

export const dimensions = [
  "app",
  "harness",
  "entrypoint",
  "model",
  "project",
  "device",
  "account",
] as const;

export interface UsageQuery {
  readonly range: Range;
  readonly unit: Unit;
  readonly by: Grouping;
  readonly q: string;
  readonly within: string | null;
  readonly sel: string | null;
  readonly all: boolean;
  readonly where: Readonly<Record<string, readonly string[]>>;
}

export interface Row {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly href: string | null;
  readonly values: Values;
  readonly series: readonly number[];
  readonly sessions: number;
  readonly lastActiveAt: number;
  readonly agentSdk: number;
  readonly accounts: readonly {
    readonly name: string;
    readonly week: number;
    readonly fiveHour: number;
  }[];
}

export interface Usage {
  readonly query: UsageQuery;
  readonly now: number;
  readonly size: BucketSize;
  readonly cells: readonly Cell[];
  readonly buckets: number;
  readonly total: {
    readonly values: Values;
    readonly series: readonly number[];
    readonly sessions: number;
    readonly previous: Values | null;
  };
  readonly agentSdk: {
    readonly share: number;
    readonly factor: number;
    readonly fiveHour: number | null;
  };
  readonly rows: readonly Row[];
  readonly rowCount: number;
  readonly selected: Row | null;
  readonly drill: {
    readonly rows: readonly Row[];
    readonly count: number;
  } | null;
  readonly owner: string | null;
  readonly limitsSince: number | null;
  readonly filters: readonly {
    readonly dimension: string;
    readonly id: string;
    readonly label: string;
  }[];
}

const single = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const queryOf = (
  params: Readonly<Record<string, string | string[] | undefined>>
): UsageQuery => ({
  all: single(params.all) === "1",
  by: oneOf(groupings, single(params.by), "agent"),
  q: single(params.q)?.trim() ?? "",
  range: oneOf(ranges, single(params.range), "7d"),
  sel: single(params.sel) ?? null,
  unit: oneOf(units, single(params.unit), "api"),
  where: Object.fromEntries(
    dimensions.flatMap((dimension) => {
      const values = single(params[`w.${dimension}`])
        ?.split(",")
        .filter((value) => value !== "");

      return values === undefined || values.length === 0
        ? []
        : [[dimension, values]];
    })
  ),
  within: single(params.within) ?? null,
});

const page = 25;

const pathOf = (
  query: UsageQuery,
  change: Readonly<Record<string, string | null>>
) => {
  const params = new URLSearchParams({
    by: query.by,
    measure: query.unit,
    range: query.range,
  });

  if (query.q !== "") {
    params.set("q", query.q);
  }

  if (query.within !== null) {
    params.set("within", query.within);
  }

  for (const [dimension, values] of Object.entries(query.where)) {
    params.set(`w.${dimension}`, values.join(","));
  }

  for (const [key, value] of Object.entries(change)) {
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  return `/deck/usage?${params}`;
};

const sum = (rows: readonly Row[], unit: Unit) =>
  rows.reduce((total, row) => total + (row.values[unit] ?? 0), 0);

export const readUsage = async (query: UsageQuery): Promise<Usage> => {
  await connection();

  const searching = query.q !== "";
  const limit = searching || query.all ? 1000 : page;

  const { view, credits, owner } = await runtime.runPromise(
    Effect.gen(function* () {
      const proxy = yield* Proxy;

      return yield* Effect.all(
        {
          credits: proxy
            .get("/deck/credits", Credits)
            .pipe(Effect.orElseSucceed(() => ({ api: [] }))),
          owner:
            query.within === null
              ? Effect.succeed(null)
              : proxy
                  .get(
                    pathOf(query, {
                      by: "agent",
                      limit: "1",
                      q: null,
                    }),
                    UsageView
                  )
                  .pipe(
                    Effect.map((found) => found.rows[0]?.label ?? null),
                    Effect.orElseSucceed(() => null)
                  ),
          view: proxy.get(pathOf(query, { limit: String(limit) }), UsageView),
        },
        { concurrency: "unbounded" }
      );
    })
  );

  const names = accountNames(view.facets.account ?? [], credits.api);

  const rowOf = (row: UsageRow): Row => ({
    accounts: row.byAccount
      .map((share) => ({
        fiveHour: share.fiveHour ?? 0,
        name: names[share.account] ?? share.account,
        week: share.week ?? 0,
      }))
      .filter((share) => share.week + share.fiveHour > 0),
    agentSdk: row.agentSdk,
    detail: row.detail,
    href: row.who?.href ?? null,
    key: row.key,
    label:
      query.by === "account"
        ? (names[row.key.slice(2)] ?? row.label)
        : row.label,
    lastActiveAt: row.lastActiveAt,
    series: row.series,
    sessions: row.sessions,
    values: valuesOf(row.amount, row.points),
  });

  const rows = view.rows.map(rowOf);
  const shown = searching ? rows : rows.slice(0, query.all ? 1000 : page);
  const selected = shown.find((row) => row.key === query.sel) ?? null;

  const drill =
    selected !== null && query.by === "agent" && selected.sessions > 1
      ? await runtime
          .runPromise(
            Effect.gen(function* () {
              const proxy = yield* Proxy;

              return yield* proxy.get(
                pathOf(query, {
                  by: "session",
                  limit: "8",
                  q: null,
                  within: selected.key,
                }),
                UsageView
              );
            })
          )
          .then(
            (found) => ({ count: found.rowCount, rows: found.rows.map(rowOf) }),
            () => null
          )
      : null;

  const now = Date.now();
  const size = view.buckets[0]?.size ?? "1d";

  const total = searching
    ? {
        previous: null,
        series: sumSeries(shown.map((row) => row.series)),
        sessions: shown.reduce((count, row) => count + row.sessions, 0),
        values: {
          api: sum(shown, "api"),
          fiveHour: sum(shown, "fiveHour"),
          plan: sum(shown, "plan"),
          tokens: sum(shown, "tokens"),
          week: sum(shown, "week"),
        },
      }
    : {
        previous:
          view.previous === null
            ? null
            : valuesOf(view.previous, view.previous.points),
        series: sumSeries(view.series.map((line) => line.values)),
        sessions: view.totals.sessions,
        values: valuesOf(view.totals, view.totals.points),
      };

  return {
    agentSdk: {
      factor: view.agentSdk.factor,
      fiveHour: view.agentSdk.fiveHour,
      share: view.agentSdk.share,
    },
    buckets: view.buckets.length,
    cells: cellsOf(view.buckets, size, view.period.timezone, now),
    drill,
    filters: Object.entries(query.where).flatMap(([dimension, ids]) =>
      ids.map((id) => ({
        dimension,
        id,
        label:
          view.facets[dimension]?.find((facet) => facet.id === id)?.label ?? id,
      }))
    ),
    limitsSince: view.coverage.limitsSince,
    now,
    owner,
    query,
    rowCount: view.rowCount,
    rows: shown,
    selected,
    size,
    total,
  };
};
