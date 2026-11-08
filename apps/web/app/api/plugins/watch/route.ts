import type { NextRequest } from "next/server";

import { watchSetup } from "@/lib/plugins/read";
import { changeStream } from "@/lib/watch/stream";

export const GET = (request: NextRequest) => changeStream(request.signal, watchSetup);
