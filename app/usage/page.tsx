import type { Metadata } from "next";

import { queryOf, readUsage } from "@/features/usage/read";
import { UsageView } from "@/features/usage/usage";
import { RefreshOnStale } from "@/lib/live/client";

export const metadata: Metadata = { title: "Usage" };

const UsagePage = async ({ searchParams }: PageProps<"/usage">) => (
  <>
    <RefreshOnStale tags={["usage"]} />
    <UsageView usage={await readUsage(queryOf(await searchParams))} />
  </>
);

export default UsagePage;
