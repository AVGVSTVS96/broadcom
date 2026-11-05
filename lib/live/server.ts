import "server-only";
import { setTimeout as sleep } from "node:timers/promises";

import { Effect, Stream } from "effect";
import { connection } from "next/server";

import { decodeLiveEvent } from "@/lib/live/decode";
import { applyChange } from "@/lib/live/event";
import type { Live, LiveEvent } from "@/lib/live/event";
import { Proxy, runtime } from "@/lib/proxy/proxy";

interface Hub {
  live: Live | null;
  readonly listeners: Set<(event: LiveEvent) => void>;
  readonly ready: Promise<boolean>;
  readonly arrived: (value: boolean) => void;
}

const empty: Live = { accounts: {}, pool: null, sessions: {} };

const createHub = (): Hub => {
  const { promise, resolve } = Promise.withResolvers<boolean>();

  const hub: Hub = {
    arrived: resolve,
    listeners: new Set(),
    live: null,
    ready: promise,
  };

  const publish = (event: LiveEvent) => {
    if (event.type === "snapshot") {
      hub.live = event.live;
      hub.arrived(true);
    } else if (event.type === "patch") {
      hub.live = applyChange(hub.live ?? empty, event.change);
    }

    for (const listener of hub.listeners) {
      listener(event);
    }
  };

  runtime.runFork(
    Effect.gen(function* () {
      const proxy = yield* Proxy;

      yield* proxy.events.pipe(
        Stream.runForEach((data) =>
          Effect.sync(() => {
            const event = decodeLiveEvent(data);

            if (event !== null) {
              publish(event);
            }
          })
        ),
        Effect.ignore,
        Effect.andThen(Effect.sleep("2 seconds")),
        Effect.forever
      );
    })
  );

  return hub;
};

declare global {
  var broadcomLive: Hub | undefined;
}

const hub = () => {
  globalThis.broadcomLive ??= createHub();

  return globalThis.broadcomLive;
};

export const readLive = async () => {
  await connection();

  const current = hub();

  await Promise.race([current.ready, sleep(5000, false)]);

  return current.live ?? empty;
};

const encoder = new TextEncoder();

const frame = (event: LiveEvent) =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

export const liveResponse = async () => {
  await readLive();

  const current = hub();
  let ping: ReturnType<typeof setInterval> | undefined;
  let send: ((event: LiveEvent) => void) | undefined;

  return new ReadableStream<Uint8Array>({
    cancel: () => {
      clearInterval(ping);

      if (send !== undefined) {
        current.listeners.delete(send);
      }
    },
    start: (controller) => {
      const deliver = (event: LiveEvent) => {
        controller.enqueue(frame(event));
      };

      ping = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 20_000);

      deliver({ live: current.live ?? empty, type: "snapshot" });
      current.listeners.add(deliver);
      send = deliver;
    },
  });
};
