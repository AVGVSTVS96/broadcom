import "server-only";

const settle = 300;
const encoder = new TextEncoder();

export const changeStream = (
  signal: AbortSignal,
  watch: (changed: () => void) => Promise<() => void>,
) => {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ping: ReturnType<typeof setInterval> | undefined;
  let unwatch: (() => void) | undefined;

  const cleanup = () => {
    closed = true;
    clearTimeout(timer);
    clearInterval(ping);
    unwatch?.();
  };

  return new Response(
    new ReadableStream<Uint8Array>({
      cancel: cleanup,
      start: async (controller) => {
        const send = (line: string) => {
          if (!closed) {
            controller.enqueue(encoder.encode(line));
          }
        };

        const stop = await watch(() => {
          timer ??= setTimeout(() => {
            timer = undefined;
            send("data: changed\n\n");
          }, settle);
        });

        if (closed || signal.aborted) {
          stop();
          cleanup();

          return;
        }

        unwatch = stop;

        ping = setInterval(() => {
          send(": ping\n\n");
        }, 20_000);

        signal.addEventListener("abort", () => {
          if (!closed) {
            cleanup();
            controller.close();
          }
        });

        send(": watching\n\n");
      },
    }),
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/event-stream",
        "x-accel-buffering": "no",
      },
    },
  );
};
