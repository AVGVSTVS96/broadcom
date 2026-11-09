import type { ReactNode } from "react";

import { texts } from "@/components/viz/meter";
import { Segments } from "@/components/viz/segments";
import type { Summary, Column as Totals } from "@/lib/pool/pool";
import { dollars, duration, when } from "@/lib/time/format";
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
    <div className="flex items-baseline gap-1.5 sm:max-wide:flex-col sm:max-wide:items-start sm:max-wide:gap-0">
      <span className={cn("text-5xl font-light tracking-tight tabular-nums", texts[totals.tone])}>
        {value}
      </span>
      <span className="text-sm whitespace-nowrap text-muted-foreground">{unit}</span>
    </div>
    <Segments parts={totals.parts} />
    <p className="text-sm text-muted-foreground">{children}</p>
  </div>
);

const percentOf = (totals: Totals) =>
  totals.parts.length === 0 ? "–" : `${Math.round(totals.left)}%`;

const unitOf = (totals: Totals) =>
  totals.parts.length === 0 ? "no readings" : `left of ${totals.total}%`;

export const Pools = ({
  summary,
  creditProblem,
  now,
}: {
  summary: Summary;
  creditProblem: string | null;
  now: number;
}) => {
  const { credit, firstBack, open, session, sessionReset, subscriptions } = summary;

  return (
    <div className="grid divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      <Column
        label="Weekly"
        value={percentOf(summary.week)}
        unit={unitOf(summary.week)}
        totals={summary.week}
      >
        {firstBack === undefined ? (
          `All ${subscriptions.length} plans have room`
        ) : (
          <>
            {firstBack.name} is back first,{" "}
            <span className="whitespace-nowrap">
              {when(firstBack.account.week.resetsAt ?? 0, now)}
            </span>
          </>
        )}
      </Column>
      <Column label="Session" value={percentOf(session)} unit={unitOf(session)} totals={session}>
        {sessionReset === undefined ? (
          `${open.length} of ${subscriptions.length} plans open`
        ) : (
          <>
            Next reset in <span className="whitespace-nowrap">{duration(sessionReset - now)}</span>
          </>
        )}
      </Column>
      <Column
        label="Free credit"
        value={credit.parts.length === 0 ? "–" : dollars(credit.left)}
        unit={credit.parts.length === 0 ? "" : `of ${dollars(credit.total)}`}
        totals={credit}
      >
        {creditProblem ??
          (credit.endsAt === null ? (
            "No API keys"
          ) : (
            <>
              {credit.empty} of {credit.parts.length} keys empty · ends{" "}
              <span className="whitespace-nowrap">{when(credit.endsAt, now)}</span>
            </>
          ))}
      </Column>
    </div>
  );
};
