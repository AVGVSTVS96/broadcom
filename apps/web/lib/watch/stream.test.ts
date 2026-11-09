import { describe, expect, mock, test } from "bun:test";
import { setTimeout as wait } from "node:timers/promises";

await mock.module("server-only", () => ({}));

const { changeStream } = await import("@/lib/watch/stream");

const uncaught: unknown[] = [];

process.on("uncaughtException", (error) => {
  uncaught.push(error);
});

const reader = (response: Response) => {
  if (response.body === null) {
    throw new Error("no body");
  }

  return response.body.getReader();
};

describe("changeStream", () => {
  test("a viewer who cancels stops the watcher and its timers", async () => {
    const unwatch = mock(() => {});
    const watcher = Promise.withResolvers<() => void>();

    const body = reader(
      changeStream(new AbortController().signal, async (changed) => {
        changed();

        return await watcher.promise;
      }),
    );

    watcher.resolve(unwatch);

    await body.read();
    await body.cancel();
    await wait(350);

    expect(unwatch).toHaveBeenCalledTimes(1);
    expect(uncaught).toEqual([]);
  });

  test("a viewer who leaves while the watcher starts is cleaned up", async () => {
    const abort = new AbortController();
    const unwatch = mock(() => {});
    const watcher = Promise.withResolvers<() => void>();
    const body = reader(changeStream(abort.signal, async () => await watcher.promise));

    abort.abort();
    await body.cancel();
    watcher.resolve(unwatch);
    await wait(20);

    expect(unwatch).toHaveBeenCalledTimes(1);
    expect(uncaught).toEqual([]);
  });

  test("abort after start closes the stream and stops the watcher", async () => {
    const abort = new AbortController();
    const unwatch = mock(() => {});
    const body = reader(changeStream(abort.signal, async () => await Promise.resolve(unwatch)));

    await body.read();
    abort.abort();
    const end = await body.read();

    expect(end.done).toBe(true);
    expect(unwatch).toHaveBeenCalledTimes(1);
  });
});
