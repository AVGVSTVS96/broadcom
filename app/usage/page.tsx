import type { Metadata } from "next";

import { queryOf, readUsage } from "@/features/usage/read";
import { UsageView } from "@/features/usage/usage";

export const metadata: Metadata = { title: "Usage" };

const UsagePage = async ({ searchParams }: PageProps<"/usage">) => (
  <UsageView usage={await readUsage(queryOf(await searchParams))} />
);

export default UsagePage;
