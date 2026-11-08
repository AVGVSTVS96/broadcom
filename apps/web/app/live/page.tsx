import type { Metadata } from "next";

import { LiveView } from "@/features/live/live";
import { readLiveData } from "@/features/live/read";
import { RefreshOnStale } from "@/lib/live/client";

export const metadata: Metadata = { title: "Live" };

const LivePage = async () => (
  <>
    <RefreshOnStale tags={["accounts"]} />
    <LiveView data={await readLiveData()} />
  </>
);

export default LivePage;
