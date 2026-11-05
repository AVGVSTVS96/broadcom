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

  const problems = [
    history.ok ? null : `Limit history didn't load: ${history.reason}`,
    grants.ok ? null : `API credit didn't load: ${grants.reason}`,
  ].filter((problem) => problem !== null);

  return (
    <>
      <RefreshOnStale tags={["accounts", "credits"]} />
      <Overview
        history={history.ok ? history.value : {}}
        grants={grants.ok ? grants.value : null}
        problems={problems}
        rendered={Date.now()}
      />
    </>
  );
};

export default OverviewPage;
