import type { Metadata } from "next";

import { LiveView } from "@/features/live/live";
import { readLiveData } from "@/features/live/read";

export const metadata: Metadata = { title: "Live" };

const LivePage = async () => <LiveView data={await readLiveData()} />;

export default LivePage;
