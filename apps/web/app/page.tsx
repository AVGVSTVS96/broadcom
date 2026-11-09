import { connection } from "next/server";

import { Overview } from "@/features/overview/overview";
import { RefreshOnStale } from "@/lib/live/client";
import { creditProblem, readGrants, readTokens, readWeekHistory } from "@/lib/proxy/read";

const OverviewPage = async () => {
  await connection();

  const [history, grants, tokens] = await Promise.all([
    readWeekHistory(),
    readGrants(),
    readTokens(),
  ]);

  const problems = [
    history.ok ? null : `Limit history didn't load: ${history.reason}`,
    creditProblem(grants),
    tokens.ok ? null : `Token history didn't load: ${tokens.reason}`,
  ].filter((problem) => problem !== null);

  return (
    <>
      <RefreshOnStale tags={["accounts", "credits"]} />
      <Overview
        history={history.ok ? history.value : {}}
        grants={grants.ok ? grants.value : null}
        tokens={tokens.ok ? tokens.value : null}
        problems={problems}
        rendered={Date.now()}
      />
    </>
  );
};

export default OverviewPage;
