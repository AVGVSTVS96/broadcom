import "server-only";

const settle = 300;
const encoder = new TextEncoder();

export const changeStream = (
  signal: AbortSignal,
  watch: (changed: () => void) => Promise<() => void>
) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start: async (controller) => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const send = (line: string) => {
          controller.enqueue(encoder.encode(line));
        };

        const unwatch = await watch(() => {
          timer ??= setTimeout(() => {
            timer = undefined;
            send("data: changed\n\n");
          }, settle);
        });

        const ping = setInterval(() => {
          send(": ping\n\n");
        }, 20_000);

        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          clearInterval(ping);
          unwatch();
          controller.close();
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
    }
  );
