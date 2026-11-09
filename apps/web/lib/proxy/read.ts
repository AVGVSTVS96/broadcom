import "server-only";
import { Effect, Schema } from "effect";
import { cacheLife } from "next/cache";

import { creditOf, loginOf } from "@/lib/pool/accounts";
import { compact } from "@/lib/pool/history";
import type { Points } from "@/lib/pool/history";
import type { Daily } from "@/lib/pool/weeks";
import { attempt, attemptCached, outcome } from "@/lib/proxy/attempt";
import type { Outcome } from "@/lib/proxy/attempt";
import { Proxy, ProxyError, runtime } from "@/lib/proxy/proxy";
import { Config, Credentials, Credits, History, LimitUsage } from "@/lib/proxy/schema";
import { redact } from "@/lib/settings/redact";
import { valuesOf } from "@/lib/settings/settings";

const weekHistory = async (): Promise<Readonly<Record<string, Points>>> => {
  "use cache";
  cacheLife("minutes");

  return await runtime.runPromise(
    Effect.gen(function* () {
      const { history } = yield* (yield* Proxy).get("/deck/accounts", History);

      return Object.fromEntries(
        history
          .filter((series) => series.kind === "week")
          .map((series) => [series.account, compact(series.points)]),
      );
    }),
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
        LimitUsage,
      );

      return {
        accounts: usage.rows.map((row) => ({
          days: row.series.map((used, index) => [usage.buckets[index]?.at ?? 0, used] as const),
          id: row.key.replace(/^a:/u, ""),
        })),
        since: usage.coverage.limitsSince,
      };
    }),
  );
};

export const readWeekHistory = async () => await attemptCached("/deck/accounts", weekHistory);

export const readDailyLimits = async () => await attemptCached("/deck/usage", dailyLimits);

export const readLogins = async () =>
  await attempt(
    Effect.gen(function* () {
      const list = yield* (yield* Proxy).get("/credentials", Credentials);

      return list.files.map(loginOf);
    }),
  );

const grants = Effect.gen(function* () {
  const view = yield* (yield* Proxy).get("/deck/credits", Credits);

  return view.api;
});

export const grantsOutcome = outcome(grants);

export const readGrants = async () => await attempt(grants);

export const creditFailure = (reason: string) => `API credit didn't load: ${reason}`;

export const creditProblem = (read: Outcome<unknown>) =>
  read.ok ? null : creditFailure(read.reason);

export const readCredits = async () => {
  const read = await readGrants();

  return read.ok ? { ok: true as const, value: read.value.map(creditOf) } : read;
};

export const readSettings = async () =>
  await attempt(
    Effect.gen(function* () {
      const raw = yield* (yield* Proxy).get("/config", Schema.Json);

      const config = yield* Schema.decodeUnknownEffect(Config)(raw).pipe(
        Effect.mapError((error) => new ProxyError({ path: "/config", reason: error.message })),
      );

      return {
        facts: {
          authDir: config.oauth?.["auth-dir"] ?? null,
          plans: (config.usage?.plans ?? []).map((plan) => ({
            name: plan.name,
            since: plan.since ?? null,
            usd: plan["monthly-usd"],
          })),
          remote: config.management?.["allow-remote"] ?? false,
          server:
            config.server?.host === undefined
              ? null
              : `${config.server.host}:${config.server.port ?? ""}`,
          stateDir: config.usage?.["state-dir"] ?? null,
        },
        raw: JSON.stringify(redact(raw), null, 2),
        values: valuesOf(config),
      };
    }),
  );
