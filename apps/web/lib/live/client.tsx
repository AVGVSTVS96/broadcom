"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { applyChange, lose } from "@/lib/live/event";
import type { Live, LiveEvent } from "@/lib/live/event";
import { useSubscription } from "@/lib/outside";

const refreshEvery = 30_000;
const reopenAfter = 2000;

interface Store {
  readonly read: () => Live;
  readonly subscribe: (listener: () => void) => () => void;
  readonly apply: (event: LiveEvent) => void;
  readonly lose: (at: number) => void;
  readonly wanted: Map<string, number>;
}

const createStore = (initial: Live): Store => {
  let live = initial;
  const listeners = new Set<() => void>();

  const set = (next: Live) => {
    live = next;

    for (const listener of listeners) {
      listener();
    }
  };

  return {
    apply: (event) => {
      if (event.type !== "stale") {
        set(event.type === "snapshot" ? event.live : applyChange(live, event.change));
      }
    },
    lose: (at) => {
      set(lose(live, "dashboard", at));
    },
    read: () => live,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    wanted: new Map(),
  };
};

const LiveContext = createContext<Store | null>(null);

const useStore = () => {
  const store = use(LiveContext);

  if (store === null) {
    throw new Error("useLive needs a LiveProvider above it");
  }

  return store;
};

export const LiveProvider = ({ initial, children }: { initial: Live; children: ReactNode }) => {
  const [store] = useState(() => createStore(initial));
  const router = useRouter();

  useSubscription(() => {
    let source: EventSource | undefined;
    let failed: number | undefined;
    let reopen: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      pending = undefined;
      last = Date.now();
      router.refresh();
    };

    const receive = (message: MessageEvent<string>) => {
      failed = undefined;
      // SAFETY: /api/live only sends events lib/live/decode.ts decoded and serialized.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the server already decoded it, and decoding again would ship every schema to the browser
      const event = JSON.parse(message.data) as LiveEvent;

      store.apply(event);

      if (
        event.type === "stale" &&
        pending === undefined &&
        event.tags.some((tag) => store.wanted.has(tag))
      ) {
        pending = setTimeout(refresh, Math.max(0, last + refreshEvery - Date.now()));
      }
    };

    const open = () => {
      const next = new EventSource("/api/live");

      next.addEventListener("message", receive);
      next.addEventListener("error", () => {
        if (failed === undefined) {
          failed = Date.now();
        } else {
          store.lose(failed);
        }

        if (next.readyState === EventSource.CLOSED) {
          reopen = setTimeout(open, reopenAfter);
        }
      });
      source = next;
    };

    open();

    return () => {
      clearTimeout(pending);
      clearTimeout(reopen);
      source?.close();
    };
  }, [store, router]);

  return <LiveContext value={store}>{children}</LiveContext>;
};

export const useLive = <A,>(select: (live: Live) => A): A => {
  const store = useStore();

  return useSyncExternalStore(
    store.subscribe,
    () => select(store.read()),
    () => select(store.read()),
  );
};

export const RefreshOnStale = ({ tags }: { tags: readonly string[] }) => {
  const { wanted } = useStore();
  const key = tags.join(" ");

  useSubscription(() => {
    const names = key.split(" ");

    for (const name of names) {
      wanted.set(name, (wanted.get(name) ?? 0) + 1);
    }

    return () => {
      for (const name of names) {
        const count = (wanted.get(name) ?? 1) - 1;

        if (count === 0) {
          wanted.delete(name);
        } else {
          wanted.set(name, count);
        }
      }
    };
  }, [wanted, key]);

  return null;
};
