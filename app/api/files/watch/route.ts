import type { NextRequest } from "next/server";

import { findWorkspace } from "@/lib/git/repos";
import { watchWorkspace } from "@/lib/git/watch";

const settle = 300;
const encoder = new TextEncoder();

export const GET = async (request: NextRequest) => {
  const ws = await findWorkspace(request.nextUrl.searchParams.get("ws") ?? "");

  if (ws === null) {
    return new Response("No such workspace", { status: 404 });
  }

  const body = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      const send = (line: string) => {
        controller.enqueue(encoder.encode(line));
      };

      const unwatch = await watchWorkspace(ws, () => {
        timer ??= setTimeout(() => {
          timer = undefined;
          send("data: changed\n\n");
        }, settle);
      });

      const ping = setInterval(() => {
        send(": ping\n\n");
      }, 20_000);

      request.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        clearInterval(ping);
        unwatch();
        controller.close();
      });

      send(": watching\n\n");
    },
  });

  return new Response(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    },
  });
};
