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

interface Store {
  readonly read: () => Live;
  readonly subscribe: (listener: () => void) => () => void;
  readonly apply: (event: LiveEvent) => void;
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
  };
};

const LiveContext = createContext<Store | null>(null);

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
    let refresh: ReturnType<typeof setTimeout> | undefined;

    source.addEventListener("message", (message: MessageEvent<string>) => {
      // SAFETY: /api/live only sends events lib/live/event.ts decoded and serialized.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const event = JSON.parse(message.data) as LiveEvent;

      store.apply(event);

      if (event.type === "stale") {
        clearTimeout(refresh);
        refresh = setTimeout(() => {
          router.refresh();
        }, 500);
      }
    });

    return () => {
      clearTimeout(refresh);
      source.close();
    };
  }, [store, router]);

  return <LiveContext value={store}>{children}</LiveContext>;
};

export const useLive = <A,>(select: (live: Live) => A): A => {
  const store = use(LiveContext);

  if (store === null) {
    throw new Error("useLive needs a LiveProvider above it");
  }

  return useSyncExternalStore(
    store.subscribe,
    () => select(store.read()),
    () => select(store.read())
  );
};
