import { liveResponse } from "@/lib/live/server";

export const GET = async () =>
  new Response(await liveResponse(), {
    headers: {
      "cache-control": "no-store",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    },
  });
