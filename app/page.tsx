"use client";

import { useLive } from "@/lib/live/client";

const Overview = () => {
  const accounts = useLive((live) => live.accounts);
  const decision = useLive((live) => live.pool?.decision ?? "");

  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-medium tracking-tight">{decision}</h1>
      <p className="text-muted-foreground">
        {Object.keys(accounts).length} accounts
      </p>
    </section>
  );
};

export default Overview;
