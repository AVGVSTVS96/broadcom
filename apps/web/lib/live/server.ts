import "server-only";
import { setTimeout as sleep } from "node:timers/promises";

import { Effect, Stream } from "effect";
import { connection } from "next/server";

import { decodeLiveEvent } from "@/lib/live/decode";
import { applyChange, lose, regain } from "@/lib/live/event";
import type { Live, LiveChange, LiveEvent } from "@/lib/live/event";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import type { Source } from "@/lib/proxy/proxy";

interface Hub {
  live: Live | null;
  readonly listeners: Set<(event: LiveEvent) => void>;
  readonly ready: Promise<boolean>;
  readonly arrived: (value: boolean) => void;
}

const empty: Live = { accounts: {}, lost: {}, pool: null, sessions: {} };

const owned = (source: Source, live: Live, snapshot: Live): Live =>
  regain(
    source === "proxy"
      ? { ...live, accounts: snapshot.accounts, pool: snapshot.pool }
      : { ...live, sessions: snapshot.sessions },
    source,
  );

const ownChange = (source: Source, change: LiveChange): LiveChange =>
  source === "proxy" ? { ...change, sessions: {} } : { ...change, accounts: {}, pool: null };

const createHub = (): Hub => {
  const { promise, resolve } = Promise.withResolvers<boolean>();

  const hub: Hub = {
    arrived: resolve,
    listeners: new Set(),
    live: null,
    ready: promise,
  };

  const broadcast = (event: LiveEvent) => {
    for (const listener of hub.listeners) {
      listener(event);
    }
  };

  const publish = (source: Source, event: LiveEvent) => {
    if (event.type === "snapshot") {
      hub.live = owned(source, hub.live ?? empty, event.live);
      hub.arrived(true);
      broadcast({ live: hub.live, type: "snapshot" });
    } else if (event.type === "patch") {
      const change = ownChange(source, event.change);

      hub.live = applyChange(hub.live ?? empty, change);
      broadcast({ change, type: "patch" });
    } else {
      broadcast(event);
    }
  };

  const drop = (source: Source) => {
    const live = hub.live ?? empty;

    if (live.lost?.[source] === undefined) {
      hub.live = lose(live, source, Date.now());
      broadcast({ live: hub.live, type: "snapshot" });
    }
  };

  const follow = (source: Source) =>
    runtime.runFork(
      Effect.gen(function* () {
        const proxy = yield* Proxy;

        yield* proxy.events(source).pipe(
          Stream.runForEach((data) =>
            Effect.sync(() => {
              const event = decodeLiveEvent(data);

              if (event !== null) {
                publish(source, event);
              }
            }),
          ),
          Effect.ignore,
          Effect.andThen(
            Effect.sync(() => {
              drop(source);
            }),
          ),
          Effect.andThen(Effect.sleep("2 seconds")),
          Effect.forever,
        );
      }),
    );

  follow("proxy");
  follow("usage");

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

const frame = (event: LiveEvent) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

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
