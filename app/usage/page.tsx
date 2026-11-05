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
  const toggle = <Views views={views} current={view} />;

  return (
    <>
      <RefreshOnStale tags={["usage"]} />
      {view === "wallet" ? (
        <div className="space-y-5">
          <WalletView wallet={await readWallet()} toggle={toggle} />
        </div>
      ) : (
        <UsageView usage={await readUsage(queryOf(params))} toggle={toggle} />
      )}
    </>
  );
};

export default UsagePage;
