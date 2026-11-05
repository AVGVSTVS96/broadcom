import "server-only";
import { Effect, Option, Stream } from "effect";
import { connection } from "next/server";

import type { Live } from "@/lib/live/event";
import { Proxy, runtime } from "@/lib/proxy/proxy";

const empty: Live = { accounts: {}, pool: null, sessions: {} };

export const readLive = async () => {
  await connection();

  return await runtime.runPromise(
    Effect.gen(function* () {
      const proxy = yield* Proxy;
      const first = yield* proxy.live.pipe(Stream.runHead);

      return Option.match(first, {
        onNone: () => empty,
        onSome: (event) => (event.type === "snapshot" ? event.live : empty),
      });
    }).pipe(
      Effect.timeout("5 seconds"),
      Effect.orElseSucceed(() => empty)
    )
  );
};

export const liveResponse = async () => {
  await connection();

  return await runtime.runPromise(
    Effect.gen(function* () {
      const proxy = yield* Proxy;

      return yield* proxy.live.pipe(
        Stream.map((event) => `data: ${JSON.stringify(event)}\n\n`),
        Stream.merge(
          Stream.tick("20 seconds").pipe(Stream.map(() => ": ping\n\n")),
          { haltStrategy: "left" }
        ),
        Stream.encodeText,
        Stream.toReadableStreamEffect()
      );
    })
  );
};
