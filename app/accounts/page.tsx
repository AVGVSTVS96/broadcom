import type { Metadata } from "next";
import { connection } from "next/server";

import { Accounts } from "@/features/accounts/accounts";
import { RefreshOnStale } from "@/lib/live/client";
import { readCredits, readLogins, readWeekHistory } from "@/lib/proxy/read";

export const metadata: Metadata = { title: "Accounts" };

const AccountsPage = async () => {
  await connection();

  const [logins, credits, history] = await Promise.all([
    readLogins(),
    readCredits(),
    readWeekHistory(),
  ]);

  const problems = [
    logins.ok ? null : `Sign-ins didn't load: ${logins.reason}`,
    credits.ok ? null : `API credit didn't load: ${credits.reason}`,
  ].filter((problem) => problem !== null);

  return (
    <>
      <RefreshOnStale tags={["credits"]} />
      <Accounts
        logins={logins.ok ? logins.value : []}
        credits={credits.ok ? credits.value : []}
        history={history.ok ? history.value : {}}
        problems={problems}
        at={Date.now()}
      />
    </>
  );
};

export default AccountsPage;
