import "server-only";
import { Effect } from "effect";
import { cacheLife } from "next/cache";

import { compact } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import type { Daily } from "@/lib/model/weeks";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import { Credits, History, LimitUsage } from "@/lib/proxy/schema";
import type { Grant } from "@/lib/proxy/schema";

const read = async <A>(
  program: Effect.Effect<A, unknown, Proxy>,
  fallback: A
) =>
  await runtime.runPromise(program.pipe(Effect.orElseSucceed(() => fallback)));

export const readWeekHistory = async (): Promise<
  Readonly<Record<string, Points>>
> => {
  "use cache";
  cacheLife("minutes");

  return await read(
    Effect.gen(function* () {
      const { history } = yield* (yield* Proxy).get("/deck/accounts", History);

      return Object.fromEntries(
        history
          .filter((series) => series.kind === "week")
          .map((series) => [series.account, compact(series.points)])
      );
    }),
    {}
  );
};

export const readGrants = async (): Promise<readonly Grant[]> => {
  "use cache";
  cacheLife("minutes");

  return await read(
    Effect.gen(function* () {
      const credits = yield* (yield* Proxy).get("/deck/credits", Credits);

      return credits.api;
    }),
    []
  );
};

export const readDailyLimits = async (): Promise<{
  since: number | null;
  accounts: readonly Daily[];
}> => {
  "use cache";
  cacheLife("minutes");

  return await read(
    Effect.gen(function* () {
      const usage = yield* (yield* Proxy).get(
        "/deck/usage?range=30d&by=account&measure=week",
        LimitUsage
      );

      return {
        accounts: usage.rows.map((row) => ({
          days: row.series.map(
            (used, index) => [usage.buckets[index]?.at ?? 0, used] as const
          ),
          id: row.key.replace(/^a:/u, ""),
        })),
        since: usage.coverage.limitsSince,
      };
    }),
    { accounts: [], since: null }
  );
};
