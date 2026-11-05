import { Effect, Schema } from "effect";
import type { Metadata } from "next";
import { connection } from "next/server";

import { Settings } from "@/features/settings/settings";
import { redact } from "@/lib/model/redact";
import { valuesOf } from "@/lib/model/settings";
import { Proxy, ProxyUnreachable, runtime } from "@/lib/proxy/proxy";
import { Config } from "@/lib/proxy/schema";

export const metadata: Metadata = { title: "Settings" };

const read = async () => {
  await connection();

  return await runtime.runPromise(
    Effect.gen(function* () {
      const raw = yield* (yield* Proxy).get("/config", Schema.Json);

      const config = yield* Schema.decodeUnknownEffect(Config)(raw).pipe(
        Effect.mapError(
          (error) =>
            new ProxyUnreachable({ path: "/config", reason: error.message })
        )
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
        problem: null,
        raw: JSON.stringify(redact(raw), null, 2),
        values: valuesOf(config),
      };
    }).pipe(
      Effect.match({
        onFailure: (error) => ({
          facts: null,
          problem: `The proxy config didn't load: ${error.reason}`,
          raw: "",
          values: null,
        }),
        onSuccess: (settings) => settings,
      })
    )
  );
};

const SettingsPage = async () => <Settings {...await read()} />;

export default SettingsPage;
