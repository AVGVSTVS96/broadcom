"use server";

import { Effect, Schema } from "effect";
import { refresh } from "next/cache";

import { conflicts, fields, patchOf, valuesOf } from "@/lib/model/settings";
import type { Change } from "@/lib/model/settings";
import { attempt } from "@/lib/proxy/attempt";
import { Proxy } from "@/lib/proxy/proxy";
import { Config } from "@/lib/proxy/schema";

const Saved = Schema.Struct({ status: Schema.String });

const Text = Schema.String;

const Switch = Schema.Boolean;

const Changes = Schema.Array(
  Schema.Union(
    fields.map((field) => {
      const value = field.kind === "switch" ? Switch : Text;

      return Schema.Struct({
        from: value,
        path: Schema.Literal(field.path.join("/")),
        value,
      });
    }),
  ),
);

const decodeChanges = Schema.decodeUnknownSync(Changes);

export const saveSettings = async (input: readonly Change[]) => {
  const changes = decodeChanges(input);

  const result = await attempt(
    Effect.gen(function* () {
      const proxy = yield* Proxy;
      const current = valuesOf(yield* proxy.get("/config", Config));
      const moved = conflicts(changes, current);

      if (moved.length > 0) {
        return moved.map((field) => field.label);
      }

      yield* proxy.send("PATCH", "/config", patchOf(changes), Saved);

      return [];
    }),
  );

  refresh();

  return result;
};
