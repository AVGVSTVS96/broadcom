import type { ReactNode } from "react";

import { Meter } from "@/components/viz/meter";
import type { Tone } from "@/components/viz/meter";
import { ago, clock, dollars, duration, utcDate } from "@/lib/model/format";
import { creditLeft, creditTotal, emptyCredit } from "@/lib/model/pool";
import type { Account, Grant, LimitWindow, Standing } from "@/lib/proxy/schema";
import { cn } from "@/lib/utils";

import { sessionTone, weekTone } from "./plans";
import type { Plan } from "./plans";

const Figure = ({
  label,
  hint,
  value,
  unit,
  tone,
  fill,
  children,
}: {
  label: string;
  hint: string;
  value: string;
  unit?: string;
  tone: Tone;
  fill: number | null;
  children?: ReactNode;
}) => (
  <div className="min-w-0 space-y-2">
    <div className="text-sm">
      {label}
      <span className="ml-1.5 text-muted-foreground">{hint}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-4xl font-light tracking-tight">{value}</span>
      {unit === undefined ? null : (
        <span className="text-sm text-muted-foreground">{unit}</span>
      )}
    </div>
    {fill === null ? null : (
      <Meter value={fill} tone={tone} className="h-2.5" />
    )}
    <p className="text-sm text-muted-foreground">{children}</p>
  </div>
);

const standings = {
  limited: "Locked",
  next: "Takes new work",
  open: "Has room",
  "signed-out": "Signed out",
  tight: "Near a cutoff",
} as const satisfies Record<Standing, string>;

const standingTone = {
  limited: "text-bad",
  next: "text-brand",
  open: "text-ok",
  "signed-out": "text-bad",
  tight: "text-over",
} as const satisfies Record<Standing, string>;

const resetsIn = (at: number | null, now: number) =>
  at === null ? null : `Resets in ${duration(Math.max(0, at - now))}`;

const WindowFigure = ({
  label,
  hint,
  window,
  tone,
  children,
}: {
  label: string;
  hint: string;
  window: LimitWindow;
  tone: Tone;
  children: ReactNode;
}) => (
  <Figure
    label={label}
    hint={hint}
    value={window.used === null ? "–" : String(Math.round(window.used))}
    unit={window.used === null ? undefined : "%"}
    tone={tone}
    fill={window.used ?? 0}
  >
    {children}
  </Figure>
);

const PlanFigures = ({ plan, now }: { plan: Plan; now: number }) => {
  const { account, pace } = plan;

  return (
    <>
      <WindowFigure
        label="Session"
        hint="5 hours"
        window={account.fiveHour}
        tone={sessionTone(account.fiveHour, now)}
      >
        {resetsIn(account.fiveHour.resetsAt, now) ?? "No reading"}
      </WindowFigure>
      <WindowFigure
        label="Weekly"
        hint="7 days"
        window={account.week}
        tone={weekTone(pace)}
      >
        {pace?.locked === true
          ? `Back ${clock(pace.resetsAt)}`
          : resetsIn(account.week.resetsAt, now)}
      </WindowFigure>
    </>
  );
};

const ResetsFigure = ({ account, now }: { account: Account; now: number }) => {
  const held = account.heldResets.reduce((sum, reset) => sum + reset.left, 0);

  const [expiring] = account.heldResets
    .map((reset) => reset.expiresAt)
    .filter((at) => at !== null)
    .toSorted((a, b) => a - b);

  return (
    <Figure
      label="Resets"
      hint="held"
      value={String(held)}
      tone="ok"
      fill={null}
    >
      {expiring === undefined
        ? null
        : `First expires in ${duration(expiring - now)}`}
    </Figure>
  );
};

const CreditFigure = ({ grants }: { grants: readonly Grant[] }) => {
  const credit = creditLeft(grants);
  const total = creditTotal(grants);
  const empty = credit < emptyCredit;

  return (
    <Figure
      label="API credit"
      hint="estimate"
      value={dollars(credit)}
      tone={empty ? "bad" : "ok"}
      fill={(credit / total) * 100}
    >
      {empty ? "Empty · " : ""}of {dollars(total)} · ends{" "}
      {utcDate(Math.min(...grants.map((grant) => grant.expiresAt)))}
    </Figure>
  );
};

export const AccountCard = ({ plan, now }: { plan: Plan; now: number }) => {
  const { account, pace, grants } = plan;
  const sampled = account.week.sampledAt ?? account.fiveHour.sampledAt;

  return (
    <article
      className={cn(
        "rounded-3xl border bg-card p-5 sm:p-6",
        account.standing === "next" && "border-brand/50"
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate">
            {plan.name}
            {plan.hasPlan ? (
              <span className="text-muted-foreground"> · {account.plan}</span>
            ) : null}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {account.label || "API key"}
          </p>
        </div>
        {sampled === null ? null : (
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
            <span className="size-1.5 rounded-full bg-ok" />
            {ago(sampled, now)}
          </span>
        )}
      </header>
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        {plan.hasPlan ? <PlanFigures plan={plan} now={now} /> : null}
        {grants.length === 0 ? null : <CreditFigure grants={grants} />}
        {plan.hasPlan ? <ResetsFigure account={account} now={now} /> : null}
      </div>
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm">
        <span className={standingTone[account.standing]}>
          {standings[account.standing]}
          {pace === null || pace.ranOut === null ? null : (
            <span className="text-muted-foreground">
              {" "}
              · ran out {clock(pace.ranOut)}
            </span>
          )}
        </span>
        <span className="text-muted-foreground">
          {account.working} working{" "}
          {account.working === 1 ? "session" : "sessions"}
        </span>
      </footer>
    </article>
  );
};
