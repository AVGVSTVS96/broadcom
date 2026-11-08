import type { Metadata } from "next";
import { connection } from "next/server";

import { Accounts } from "@/features/accounts/accounts";
import { RefreshOnStale } from "@/lib/live/client";
import { readCredits, readLogins } from "@/lib/proxy/read";

export const metadata: Metadata = { title: "Accounts" };

const AccountsPage = async () => {
  await connection();

  const [logins, credits] = await Promise.all([readLogins(), readCredits()]);

  const problems = [
    logins.ok ? null : `Sign-ins didn't load: ${logins.reason}`,
    credits.ok ? null : `API keys didn't load: ${credits.reason}`,
  ].filter((problem) => problem !== null);

  return (
    <>
      <RefreshOnStale tags={["credits"]} />
      <Accounts
        logins={logins.ok ? logins.value : []}
        credits={credits.ok ? credits.value : []}
        problems={problems}
        at={Date.now()}
      />
    </>
  );
};

export default AccountsPage;
