import type { ReactNode } from "react";

import { texts } from "@/components/viz/meter";
import { Segments } from "@/components/viz/segments";
import { dollars, duration, utcDate, when } from "@/lib/model/format";
import type { Summary, Column as Totals } from "@/lib/model/pool";
import { cn } from "@/lib/utils";

const Column = ({
  label,
  value,
  unit,
  totals,
  children,
}: {
  label: string;
  value: string;
  unit: string;
  totals: Totals;
  children: ReactNode;
}) => (
  <div className="min-w-0 space-y-3 py-5 sm:px-6 sm:first:pl-0 sm:last:pr-0">
    <div className="text-sm">{label}</div>
    <div className="flex items-baseline gap-1.5">
      <span
        className={cn(
          "text-5xl font-light tracking-tight tabular-nums",
          texts[totals.tone]
        )}
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
    <Segments parts={totals.parts} />
    <p className="text-sm text-muted-foreground">{children}</p>
  </div>
);

const percentOf = (totals: Totals) => `${Math.round(totals.left)}%`;

export const Pools = ({
  summary,
  creditProblem,
  now,
}: {
  summary: Summary;
  creditProblem: string | null;
  now: number;
}) => {
  const { credit, firstBack, open, session, sessionReset, subscriptions } =
    summary;

  return (
    <div className="grid border-y max-sm:divide-y sm:grid-cols-3 sm:divide-x">
      <Column
        label="Weekly"
        value={percentOf(summary.week)}
        unit={`left of ${summary.week.total}%`}
        totals={summary.week}
      >
        {firstBack === undefined
          ? `All ${subscriptions.length} plans have room`
          : `${firstBack.name} is back first, ${when(firstBack.account.week.resetsAt ?? 0, now)}`}
      </Column>
      <Column
        label="Session"
        value={percentOf(session)}
        unit={`left of ${session.total}%`}
        totals={session}
      >
        {sessionReset === undefined
          ? `${open.length} of ${subscriptions.length} plans open`
          : `Next reset in ${duration(sessionReset - now)}`}
      </Column>
      <Column
        label="Free credit"
        value={credit.parts.length === 0 ? "–" : dollars(credit.left)}
        unit={credit.parts.length === 0 ? "" : `of ${dollars(credit.total)}`}
        totals={credit}
      >
        {creditProblem ??
          (credit.endsAt === null
            ? "No API keys"
            : `${credit.empty} of ${credit.parts.length} keys empty · ends ${utcDate(credit.endsAt)}`)}
      </Column>
    </div>
  );
};
