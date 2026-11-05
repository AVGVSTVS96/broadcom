import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { hatchStyle } from "@/components/viz/hatch";
import { fills, texts } from "@/components/viz/meter";
import { dollars, duration, percent, when } from "@/lib/model/format";
import { WEEK } from "@/lib/model/history";
import { creditLeft, creditTotal } from "@/lib/model/pool";
import type { Plan } from "@/lib/model/pool";
import { creditTone, windowTone } from "@/lib/model/tone";
import type { Tone } from "@/lib/model/tone";
import type { LimitWindow } from "@/lib/proxy/schema";
import { cn } from "@/lib/utils";

const Bar = ({
  value,
  tone,
  locked = false,
}: {
  value: number;
  tone: Tone;
  locked?: boolean;
}) => (
  <div
    className="h-1.5 overflow-hidden rounded-full bg-track"
    style={locked ? hatchStyle : undefined}
  >
    {locked ? null : (
      <div
        className={cn("h-full rounded-full", fills[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    )}
  </div>
);

const Cell = ({
  label,
  value,
  tone,
  children,
  note,
}: {
  label: string;
  value: string;
  tone: Tone;
  children: ReactNode;
  note: ReactNode;
}) => (
  <div className="min-w-0 space-y-1.5">
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm tabular-nums",
          tone === "ok" ? "text-foreground" : texts[tone]
        )}
      >
        {value}
      </span>
    </div>
    {children}
    <p className="truncate text-xs text-muted-foreground">{note}</p>
  </div>
);

const used = (window: LimitWindow) =>
  window.used === null ? "–" : percent(window.used);

const Session = ({ plan, now }: { plan: Plan; now: number }) => {
  const window = plan.account.fiveHour;
  const tone = windowTone(window);

  return (
    <Cell
      label="Session"
      value={used(window)}
      tone={tone}
      note={
        window.resetsAt === null
          ? "No reading"
          : `in ${duration(window.resetsAt - now)}`
      }
    >
      <Bar value={window.used ?? 0} tone={tone} />
    </Cell>
  );
};

const Weekly = ({ plan, now }: { plan: Plan; now: number }) => {
  const { pace } = plan;
  const window = plan.account.week;
  const tone = windowTone(window, pace);

  const note = () => {
    if (pace === null) {
      return "No reading";
    }

    if (pace.locked) {
      return `Back ${when(pace.resetsAt, now)}`;
    }

    return pace.runsOut === null ? (
      `Resets ${when(pace.resetsAt, now)}`
    ) : (
      <span className="text-over">Runs out {when(pace.runsOut, now)}</span>
    );
  };

  return (
    <Cell label="Weekly" value={used(window)} tone={tone} note={note()}>
      <Bar
        value={window.used ?? 0}
        tone={tone}
        locked={pace?.locked === true}
      />
    </Cell>
  );
};

const Credit = ({ plan }: { plan: Plan }) => {
  const left = creditLeft(plan.grants);
  const total = creditTotal(plan.grants);
  const tone = creditTone(left, total);

  return (
    <Cell
      label="API credit"
      value={dollars(left)}
      tone={tone}
      note={`of ${dollars(total)} · estimate`}
    >
      <Bar value={(left / total) * 100} tone={tone} />
    </Cell>
  );
};

const facts = (plan: Plan, now: number) => {
  const { heldResets, resetsSpent = [], working } = plan.account;
  const held = heldResets.reduce((sum, reset) => sum + reset.left, 0);
  const spent = Math.max(0, ...resetsSpent);

  return [
    working > 0 ? `${working} active` : null,
    held > 0 ? `${held} ${held === 1 ? "reset" : "resets"} held` : null,
    now - spent < WEEK ? `reset used ${when(spent, now)}` : null,
  ].filter((fact) => fact !== null);
};

export const PlanRows = ({
  plans,
  next,
  now,
}: {
  plans: readonly Plan[];
  next: string | null;
  now: number;
}) => (
  <section aria-label="Plans" className="divide-y border-b">
    {plans.map((plan) => (
      <Link
        key={plan.id}
        href={`/accounts#${plan.id}`}
        className="group grid items-center gap-x-6 gap-y-3 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[11rem_minmax(0,1fr)_1rem] sm:px-2"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate">
            {plan.id === next ? (
              <span className="size-2 shrink-0 rounded-full bg-brand" />
            ) : null}
            <span className={cn("truncate", plan.id === next && "text-brand")}>
              {plan.name}
            </span>
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {[plan.account.plan || "API key", ...facts(plan, now)].join(" · ")}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 sm:gap-6">
          {plan.hasPlan ? <Session plan={plan} now={now} /> : <div />}
          {plan.hasPlan ? <Weekly plan={plan} now={now} /> : <div />}
          {plan.grants.length === 0 ? <div /> : <Credit plan={plan} />}
        </div>
        <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 max-sm:hidden" />
      </Link>
    ))}
  </section>
);
