import type { Metadata } from "next";
import { connection } from "next/server";

import { Limits } from "@/features/limits/limits";
import { viewOf } from "@/features/limits/views";
import { readDailyLimits, readWeekHistory } from "@/lib/proxy/read";

export const metadata: Metadata = { title: "Limits" };

const LimitsPage = async ({ searchParams }: PageProps<"/limits">) => {
  await connection();

  const params = await searchParams;
  const view = viewOf(params.view);

  const [history, daily] = await Promise.all([
    readWeekHistory(),
    view === "weeks" ? readDailyLimits() : null,
  ]);

  return (
    <Limits view={view} history={history} daily={daily} rendered={Date.now()} />
  );
};

export default LimitsPage;
