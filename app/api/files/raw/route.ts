import type { NextRequest } from "next/server";

import { readPicture } from "@/lib/git/read";
import { findWorkspace } from "@/lib/git/repos";

export const GET = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const ws = await findWorkspace(params.get("ws") ?? "");

  const picture =
    ws === null ? null : await readPicture(ws, params.get("path") ?? "");

  return picture === null
    ? new Response("Not a picture in this workspace", { status: 404 })
    : new Response(new Uint8Array(picture.data), {
        headers: {
          "cache-control": "no-store",
          "content-type": picture.type,
          "x-content-type-options": "nosniff",
        },
      });
};
