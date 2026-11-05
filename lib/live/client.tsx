"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import { applyChange } from "@/lib/live/event";
import type { Live, LiveEvent } from "@/lib/live/event";

const refreshEvery = 30_000;

interface Store {
  readonly read: () => Live;
  readonly subscribe: (listener: () => void) => () => void;
  readonly apply: (event: LiveEvent) => void;
  readonly wanted: Map<string, number>;
}

const createStore = (initial: Live): Store => {
  let live = initial;
  const listeners = new Set<() => void>();

  return {
    apply: (event) => {
      if (event.type === "stale") {
        return;
      }

      live =
        event.type === "snapshot"
          ? event.live
          : applyChange(live, event.change);

      for (const listener of listeners) {
        listener();
      }
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

export const LiveProvider = ({
  initial,
  children,
}: {
  initial: Live;
  children: ReactNode;
}) => {
  const [store] = useState(() => createStore(initial));
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/live");
    let last = 0;
    let pending: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      pending = undefined;
      last = Date.now();
      router.refresh();
    };

    source.addEventListener("message", (message: MessageEvent<string>) => {
      // SAFETY: /api/live only sends events lib/live/decode.ts decoded and serialized.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const event = JSON.parse(message.data) as LiveEvent;

      store.apply(event);

      if (
        event.type === "stale" &&
        pending === undefined &&
        event.tags.some((tag) => store.wanted.has(tag))
      ) {
        pending = setTimeout(
          refresh,
          Math.max(0, last + refreshEvery - Date.now())
        );
      }
    });

    return () => {
      clearTimeout(pending);
      source.close();
    };
  }, [store, router]);

  return <LiveContext value={store}>{children}</LiveContext>;
};

export const useLive = <A,>(select: (live: Live) => A): A => {
  const store = useStore();

  return useSyncExternalStore(
    store.subscribe,
    () => select(store.read()),
    () => select(store.read())
  );
};

export const RefreshOnStale = ({ tags }: { tags: readonly string[] }) => {
  const { wanted } = useStore();
  const key = tags.join(" ");

  useEffect(() => {
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
