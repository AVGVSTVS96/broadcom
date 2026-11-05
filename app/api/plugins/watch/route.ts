import type { NextRequest } from "next/server";

import { watchSetup } from "@/lib/hex/setup";
import { changeStream } from "@/lib/watch/stream";

export const GET = (request: NextRequest) =>
  changeStream(request.signal, watchSetup);
