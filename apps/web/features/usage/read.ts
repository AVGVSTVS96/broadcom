import "server-only";
import { Effect } from "effect";
import { connection } from "next/server";

import { readLive } from "@/lib/live/server";
import { namesOf } from "@/lib/pool/names";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import { creditFailure, creditProblem, grantsOutcome } from "@/lib/proxy/read";
import { Config, UsageView } from "@/lib/proxy/schema";
import type { BucketSize, UsageAmount, UsageRow } from "@/lib/proxy/schema";
import {
  bucketLabel,
  cellsOf,
  coverageOf,
  groupings,
  isLimit,
  labelsOf,
  oneOf,
  ranges,
  readingsOf,
  stackOf,
  sumSeries,
  totalOf,
  units,
  valuesOf,
} from "@/lib/usage/usage";
import type {
  Cell,
  Coverage,
  Grouping,
  Layer,
  Range,
  Reading,
  Unit,
  Values,
} from "@/lib/usage/usage";
import { walletOf } from "@/lib/usage/wallet";

export const dimensions = [
  "app",
  "harness",
  "entrypoint",
  "model",
  "project",
  "device",
  "account",
] as const;

export const page = 15;

export interface UsageQuery {
  readonly range: Range;
  readonly unit: Unit;
  readonly by: Grouping;
  readonly q: string;
  readonly within: string | null;
  readonly sel: string | null;
  readonly rows: number;
  readonly where: Readonly<Record<string, readonly string[]>>;
}

export interface Row {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly href: string | null;
  readonly values: Values;
  readonly sessions: number;
  readonly lastActiveAt: number;
  readonly agentSdk: number;
}

export interface Selected extends Row {
  readonly pinned: boolean;
  readonly accounts: readonly {
    readonly name: string;
    readonly week: number | null;
    readonly fiveHour: number | null;
  }[];
  readonly drill: {
    readonly rows: readonly Row[];
    readonly count: number;
  } | null;
}

export interface Mix {
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
  readonly input: number;
}

const mixOf = (amounts: readonly UsageAmount[]): Mix => {
  const mix = { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 };

  for (const amount of amounts) {
    mix.cacheRead += amount.cacheRead;
    mix.cacheWrite += amount.cacheWrite;
    mix.input += amount.input;
    mix.output += amount.output;
  }

  return mix;
};

export interface Usage {
  readonly query: UsageQuery;
  readonly now: number;
  readonly size: BucketSize;
  readonly cells: readonly Cell[];
  readonly ticks: readonly string[];
  readonly layers: readonly Layer[];
  readonly readings: readonly Reading[] | null;
  readonly coverage: Coverage | null;
  readonly total: {
    readonly values: Values;
    readonly sessions: number;
    readonly previous: Values | null;
    readonly cacheHit: number | null;
    readonly mix: Mix;
  };
  readonly agentSdk: {
    readonly share: number;
    readonly factor: number;
    readonly fiveHour: number | null;
  };
  readonly rows: readonly Row[];
  readonly rowCount: number;
  readonly selected: Selected | null;
  readonly owner: string | null;
  readonly problems: readonly string[];
  readonly filters: readonly {
    readonly dimension: string;
    readonly id: string;
    readonly label: string;
  }[];
}

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export const queryOf = (
  params: Readonly<Record<string, string | string[] | undefined>>,
): UsageQuery => ({
  by: oneOf(groupings, single(params.by), "agent"),
  q: single(params.q)?.trim() ?? "",
  range: oneOf(ranges, single(params.range), "7d"),
  rows: Math.max(page, Math.trunc(Number(single(params.rows) ?? 0)) || 0),
  sel: single(params.sel) ?? null,
  unit: oneOf(units, single(params.unit), "api"),
  where: Object.fromEntries(
    dimensions.flatMap((dimension) => {
      const values = single(params[`w.${dimension}`])
        ?.split(",")
        .filter((value) => value !== "");

      return values === undefined || values.length === 0 ? [] : [[dimension, values]];
    }),
  ),
  within: single(params.within) ?? null,
});

const everyMatch = 5000;

const named = 3;

const pathOf = (query: UsageQuery, change: Readonly<Record<string, string | null>>) => {
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

const get = (path: string) =>
  Effect.gen(function* () {
    return yield* (yield* Proxy).get(path, UsageView);
  });

const totalsOf = (view: UsageView, searching: boolean) =>
  searching
    ? {
        ...totalOf(
          view.rows.map((row) => ({
            series: row.series,
            sessions: row.sessions,
            values: valuesOf(row.amount, row.points),
          })),
        ),
        cacheHit: null,
        mix: mixOf(view.rows.map((row) => row.amount)),
        previous: null,
      }
    : {
        cacheHit: view.totals.cacheHitRate,
        mix: mixOf([view.totals]),
        previous: view.previous === null ? null : valuesOf(view.previous, view.previous.points),
        series: sumSeries(view.series.map((line) => line.values)),
        sessions: view.totals.sessions,
        values: valuesOf(view.totals, view.totals.points),
      };

const spentOf = (spend: UsageView, searching: boolean) =>
  sumSeries(
    searching ? spend.rows.map((row) => row.series) : spend.series.map((line) => line.values),
  );

export const readUsage = async (query: UsageQuery): Promise<Usage> => {
  await connection();

  const searching = query.q !== "";

  const agent = (key: string | null) =>
    key === null
      ? Effect.succeed(null)
      : get(pathOf(query, { by: "agent", limit: "1", q: null, within: key })).pipe(
          Effect.map((found) => found.rows[0] ?? null),
          Effect.orElseSucceed(() => null),
        );

  const { view, spend, credits, owner } = await runtime.runPromise(
    Effect.all(
      {
        credits: grantsOutcome,
        owner: agent(query.within),
        spend: isLimit(query.unit)
          ? get(
              pathOf(query, {
                limit: searching ? String(everyMatch) : "1",
                measure: "api",
              }),
            )
          : Effect.succeed(null),
        view: get(
          pathOf(query, {
            limit: String(searching ? everyMatch : query.rows),
          }),
        ),
      },
      { concurrency: "unbounded" },
    ),
  );

  const names = namesOf(view.facets.account ?? [], credits.ok ? credits.value : []);
  const labels = labelsOf(view.rows);

  const rowOf = (row: UsageRow): Row => ({
    agentSdk: row.agentSdk,
    detail: row.detail,
    href: row.who?.href ?? null,
    key: row.key,
    label:
      query.by === "account"
        ? (names[row.key.slice(2)] ?? row.label)
        : (labels.get(row.key) ?? row.label),
    lastActiveAt: row.lastActiveAt,
    sessions: row.sessions,
    values: valuesOf(row.amount, row.points),
  });

  const shown = view.rows.slice(0, query.rows);
  const agents = query.by === "agent";

  const { picked, drill } = await runtime.runPromise(
    Effect.gen(function* () {
      const row =
        view.rows.find((one) => one.key === query.sel) ?? (agents ? yield* agent(query.sel) : null);

      if (row === null || !agents || row.sessions <= 1) {
        return { drill: null, picked: row };
      }

      const sessions = yield* get(
        pathOf(query, { by: "session", limit: "8", q: null, within: row.key }),
      ).pipe(
        Effect.map((found) => ({
          count: found.rowCount,
          rows: found.rows.map(rowOf),
        })),
        Effect.orElseSucceed(() => null),
      );

      return { drill: sessions, picked: row };
    }),
  );

  const now = Date.now();
  const size = view.buckets[0]?.size ?? "1d";
  const zone = view.period.timezone;
  const cells = cellsOf(view.buckets, size, zone, now);
  const total = totalsOf(view, searching);

  const layers = stackOf(
    picked === null
      ? view.rows.slice(0, named).map((row) => ({
          key: row.key,
          label: rowOf(row).label,
          values: row.series,
        }))
      : [
          {
            key: picked.key,
            label: rowOf(picked).label,
            values: picked.series,
          },
        ],
    total.series,
  );

  const spent = spend === null ? null : spentOf(spend, searching);
  const readings = spent === null ? null : readingsOf(total.series, spent);

  return {
    agentSdk: {
      factor: view.agentSdk.factor,
      fiveHour: view.agentSdk.fiveHour,
      share: view.agentSdk.share,
    },
    cells,
    coverage:
      readings === null || spent === null
        ? null
        : coverageOf(readings, spent, view.buckets, size, cells, zone),
    filters: Object.entries(query.where).flatMap(([dimension, ids]) =>
      ids.map((id) => ({
        dimension,
        id,
        label: view.facets[dimension]?.find((facet) => facet.id === id)?.label ?? id,
      })),
    ),
    layers,
    now,
    owner: owner?.label ?? null,
    problems: [creditProblem(credits)].filter((problem) => problem !== null),
    query,
    readings,
    rowCount: view.rowCount,
    rows: shown.map(rowOf),
    selected:
      picked === null
        ? null
        : {
            ...rowOf(picked),
            accounts: picked.byAccount
              .map((share) => ({
                fiveHour: share.fiveHour,
                name: names[share.account] ?? share.account,
                week: share.week,
              }))
              .filter((share) => (share.week ?? 0) + (share.fiveHour ?? 0) > 0),
            drill,
            pinned: !shown.some((row) => row.key === picked.key),
          },
    size,
    ticks: view.buckets.map((bucket) => bucketLabel(bucket.at, size, zone)),
    total: {
      cacheHit: total.cacheHit,
      mix: total.mix,
      previous: total.previous,
      sessions: total.sessions,
      values: total.values,
    },
  };
};

const spendBy = (by: "account" | "harness") =>
  Effect.gen(function* () {
    return yield* (yield* Proxy).get(
      `/deck/usage?range=30d&by=${by}&measure=api&limit=100`,
      UsageView,
    );
  });

const spent = (view: UsageView, prefix: string) =>
  Object.fromEntries(view.rows.map((row) => [row.key.slice(prefix.length), row.amount.apiUsd]));

export const readWallet = async () => {
  const live = await readLive();

  const { accounts, harness, credits, config } = await runtime.runPromise(
    Effect.all(
      {
        accounts: spendBy("account"),
        config: Effect.gen(function* () {
          return yield* (yield* Proxy).get("/config", Config);
        }),
        credits: grantsOutcome,
        harness: spendBy("harness"),
      },
      { concurrency: "unbounded" },
    ),
  );

  if (!credits.ok) {
    return { now: Date.now(), problems: [creditFailure(credits.reason)], wallet: null };
  }

  const names = namesOf(accounts.facets.account ?? [], credits.value);

  const wallet = walletOf({
    byAccount: spent(accounts, "a:"),
    byHarness: spent(harness, "h:"),
    grants: credits.value.map((grant) => ({
      allowance: grant.allowance,
      expiresAt: grant.expiresAt,
      id: grant.credentialId,
      name: names[grant.credentialId] ?? "API key",
      remaining: grant.remaining,
    })),
    plans: (config.usage?.plans ?? []).map((plan) => ({
      monthly: plan["monthly-usd"],
      name: plan.name,
      providers: plan.providers ?? [],
      since: plan.since === undefined ? null : Date.parse(plan.since),
    })),
    seats: Object.values(live.accounts).map((account) => ({
      id: account.id,
      name: names[account.id] ?? account.label,
      plan: account.plan,
    })),
    total: accounts.totals.apiUsd,
  });

  return {
    now: Date.now(),
    problems: [],
    wallet,
  };
};
