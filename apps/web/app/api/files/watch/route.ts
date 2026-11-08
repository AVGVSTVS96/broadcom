import type { NextRequest } from "next/server";

import { findWorkspace } from "@/lib/files/repos";
import { watchWorkspace } from "@/lib/files/watch";
import { changeStream } from "@/lib/watch/stream";

export const GET = async (request: NextRequest) => {
  const ws = await findWorkspace(request.nextUrl.searchParams.get("ws") ?? "");

  return ws === null
    ? new Response("No such workspace", { status: 404 })
    : changeStream(request.signal, async (changed) => await watchWorkspace(ws, changed));
};
