import type { Metadata } from "next";

import { Views } from "@/components/viz/views";
import { queryOf, readUsage, readWallet } from "@/features/usage/read";
import { UsageView } from "@/features/usage/usage";
import { viewOf, views } from "@/features/usage/views";
import { WalletView } from "@/features/usage/wallet";
import { RefreshOnStale } from "@/lib/live/client";

export const metadata: Metadata = { title: "Usage" };

const UsagePage = async ({ searchParams }: PageProps<"/usage">) => {
  const params = await searchParams;
  const view = viewOf(params.view);

  return (
    <>
      <RefreshOnStale tags={["usage"]} />
      <div className="group/page space-y-5">
        <Views views={views} current={view} />
        <div className="space-y-5 transition-opacity delay-150 duration-300 group-has-[nav[aria-busy=true]]/page:opacity-60">
          {view === "wallet" ? (
            <WalletView wallet={await readWallet()} />
          ) : (
            <UsageView usage={await readUsage(queryOf(params))} />
          )}
        </div>
      </div>
    </>
  );
};

export default UsagePage;
