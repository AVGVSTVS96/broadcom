import "server-only";
import { Effect } from "effect";
import { cacheLife } from "next/cache";

import { creditOf, loginOf } from "@/lib/model/accounts";
import { compact } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import type { Daily } from "@/lib/model/weeks";
import { attempt, attemptCached } from "@/lib/proxy/attempt";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import { Credentials, Credits, History, LimitUsage } from "@/lib/proxy/schema";
import type { Grant } from "@/lib/proxy/schema";

const weekHistory = async (): Promise<Readonly<Record<string, Points>>> => {
  "use cache";
  cacheLife("minutes");

  return await runtime.runPromise(
    Effect.gen(function* () {
      const { history } = yield* (yield* Proxy).get("/deck/accounts", History);

      return Object.fromEntries(
        history
          .filter((series) => series.kind === "week")
          .map((series) => [series.account, compact(series.points)])
      );
    })
  );
};

const grants = async (): Promise<readonly Grant[]> => {
  "use cache";
  cacheLife("minutes");

  return await runtime.runPromise(
    Effect.gen(function* () {
      const credits = yield* (yield* Proxy).get("/deck/credits", Credits);

      return credits.api;
    })
  );
};

const dailyLimits = async (): Promise<{
  since: number | null;
  accounts: readonly Daily[];
}> => {
  "use cache";
  cacheLife("minutes");

  return await runtime.runPromise(
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
    })
  );
};

export const readWeekHistory = async () =>
  await attemptCached("/deck/accounts", weekHistory);

export const readGrants = async () =>
  await attemptCached("/deck/credits", grants);

export const readDailyLimits = async () =>
  await attemptCached("/deck/usage", dailyLimits);

export const readLogins = async () =>
  await attempt(
    Effect.gen(function* () {
      const list = yield* (yield* Proxy).get("/credentials", Credentials);

      return list.files.map(loginOf);
    })
  );

export const readCredits = async () =>
  await attempt(
    Effect.gen(function* () {
      const view = yield* (yield* Proxy).get("/deck/credits", Credits);

      return view.api.map(creditOf);
    })
  );
