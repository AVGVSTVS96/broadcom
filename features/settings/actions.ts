"use server";

import { Effect, Predicate, Schema } from "effect";
import { refresh } from "next/cache";

import { fields } from "@/lib/model/settings";
import type { Change } from "@/lib/model/settings";
import { Proxy, runtime } from "@/lib/proxy/proxy";

const Saved = Schema.Struct({ status: Schema.String });

const Changes = Schema.Array(
  Schema.Struct({
    path: Schema.Literals(fields.map((field) => field.path.join("/"))),
    value: Schema.Union([Schema.String, Schema.Boolean]),
  })
);

const decodeChanges = Schema.decodeUnknownSync(Changes);

export const saveSettings = async (changes: readonly Change[]) => {
  const checked = decodeChanges(changes);

  const mismatched = checked.find(
    (change) =>
      (fields.find((field) => field.path.join("/") === change.path)?.kind ===
        "switch") !==
      Predicate.isBoolean(change.value)
  );

  if (mismatched !== undefined) {
    return {
      ok: false,
      reason: `${mismatched.path} has the wrong type`,
    } as const;
  }

  const result = await runtime.runPromise(
    Effect.gen(function* () {
      const proxy = yield* Proxy;

      for (const change of checked) {
        yield* proxy.send(
          "PATCH",
          `/config/${change.path}`,
          change.value,
          Saved
        );
      }
    }).pipe(
      Effect.match({
        onFailure: (error) => ({ ok: false, reason: error.reason }) as const,
        onSuccess: () => ({ ok: true }) as const,
      })
    )
  );

  refresh();

  return result;
};
