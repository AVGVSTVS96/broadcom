import { connection } from "next/server";

import { Overview } from "@/features/overview/overview";
import { RefreshOnStale } from "@/lib/live/client";
import { readGrants, readWeekHistory } from "@/lib/proxy/read";

const OverviewPage = async () => {
  await connection();

  const [history, grants] = await Promise.all([
    readWeekHistory(),
    readGrants(),
  ]);

  return (
    <>
      <RefreshOnStale tags={["accounts", "credits"]} />
      <Overview history={history} grants={grants} rendered={Date.now()} />
    </>
  );
};

export default OverviewPage;
