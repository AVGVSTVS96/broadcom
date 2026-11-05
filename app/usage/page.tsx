import type { Metadata } from "next";

import { Views } from "@/components/viz/views";
import { queryOf, readUsage } from "@/features/usage/read";
import { UsageView } from "@/features/usage/usage";
import { viewOf, views } from "@/features/usage/views";
import { WalletView } from "@/features/usage/wallet";
import { readWallet } from "@/features/usage/wallet-read";
import { RefreshOnStale } from "@/lib/live/client";

export const metadata: Metadata = { title: "Usage" };

const UsagePage = async ({ searchParams }: PageProps<"/usage">) => {
  const params = await searchParams;
  const view = viewOf(params.view);

  return (
    <>
      <RefreshOnStale tags={["usage"]} />
      <div className="space-y-5">
        <Views views={views} current={view} />
        {view === "wallet" ? (
          <WalletView wallet={await readWallet()} />
        ) : (
          <UsageView usage={await readUsage(queryOf(params))} />
        )}
      </div>
    </>
  );
};

export default UsagePage;
