"use client";

import { Views } from "@/components/viz/views";
import { useLive } from "@/lib/live/client";
import { useNow } from "@/lib/live/now";
import type { Points } from "@/lib/model/history";
import { plansOf } from "@/lib/model/pool";
import type { Daily } from "@/lib/model/weeks";

import { ActivityView } from "./activity";
import { HandOffView } from "./hand-off";
import { TimelineView } from "./timeline";
import { views } from "./views";
import type { View } from "./views";
import { WeeksView } from "./weeks";

export const Limits = ({
  view,
  history,
  daily,
  rendered,
}: {
  view: View;
  history: Readonly<Record<string, Points>>;
  daily: { since: number | null; accounts: readonly Daily[] } | null;
  rendered: number;
}) => {
  const accounts = useLive((live) => live.accounts);
  const now = useNow(rendered);

  const plans = plansOf(accounts, [], history, now).filter(
    (plan) => plan.hasPlan
  );

  const toggle = <Views views={views} current={view} />;

  if (view === "weeks") {
    return (
      <WeeksView
        plans={plans}
        daily={daily}
        history={history}
        now={now}
        toggle={toggle}
      />
    );
  }

  if (view === "activity") {
    return (
      <ActivityView plans={plans} history={history} now={now} toggle={toggle} />
    );
  }

  if (view === "hand-off") {
    return (
      <HandOffView plans={plans} history={history} now={now} toggle={toggle} />
    );
  }

  return (
    <TimelineView plans={plans} history={history} now={now} toggle={toggle} />
  );
};
