"use client";

import { useState } from "react";

import { Problems } from "@/components/viz/problems";
import { Views } from "@/components/viz/views";
import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import type { Points } from "@/lib/pool/history";
import { plansOf } from "@/lib/pool/pool";
import type { Daily } from "@/lib/pool/weeks";

import { ActivityView } from "./activity";
import { HandOffView } from "./hand-off";
import { SpiralView } from "./spiral";
import { TimelineView } from "./timeline";
import { views } from "./views";
import type { View } from "./views";
import { WeeksView } from "./weeks";

export const Limits = ({
  view,
  history,
  daily,
  problems,
  rendered,
}: {
  view: View;
  history: Readonly<Record<string, Points>>;
  daily: { since: number | null; accounts: readonly Daily[] } | null;
  problems: readonly string[];
  rendered: number;
}) => {
  const accounts = useLive((live) => live.accounts);
  const now = useNow(rendered);
  const [chosen, setChosen] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  const plans = plansOf(accounts, [], history, now).filter((plan) => plan.hasPlan);

  const body = () => {
    if (view === "weeks") {
      return <WeeksView plans={plans} daily={daily} history={history} now={now} />;
    }

    if (view === "activity") {
      return <ActivityView plans={plans} history={history} now={now} />;
    }

    if (view === "hand-off") {
      return <HandOffView plans={plans} history={history} now={now} />;
    }

    if (view === "timeline") {
      return <TimelineView plans={plans} history={history} now={now} />;
    }

    return (
      <SpiralView
        plans={plans}
        daily={daily}
        history={history}
        now={now}
        chosen={chosen}
        setChosen={setChosen}
        picked={picked}
        setPicked={setPicked}
      />
    );
  };

  return (
    <div className="group/page space-y-5">
      <Views views={views} current={view} />
      <div className="space-y-5 transition-opacity delay-150 duration-300 group-has-[nav[aria-busy=true]]/page:opacity-60">
        <Problems problems={problems} />
        {body()}
      </div>
    </div>
  );
};
