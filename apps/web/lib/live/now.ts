"use client";

import { useSyncExternalStore } from "react";

const tick = 15_000;

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  timer ??= setInterval(() => {
    now = Date.now();

    for (const notify of listeners) {
      notify();
    }
  }, tick);

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
};

export const useNow = (rendered: number) =>
  useSyncExternalStore(
    subscribe,
    () => Math.max(now, rendered),
    () => rendered,
  );
