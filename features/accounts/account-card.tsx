"use client";

import { PauseIcon, PlayIcon, RotateCwIcon } from "lucide-react";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { hatchStyle } from "@/components/viz/hatch";
import { Meter } from "@/components/viz/meter";
import { Stat } from "@/components/viz/stat";
import {
  removeCredential,
  renewCredential,
  setDisabled,
} from "@/features/accounts/actions";
import { SignIn } from "@/features/accounts/sign-in";
import { resets } from "@/lib/model/accounts";
import type { Login, Row, State } from "@/lib/model/accounts";
import {
  ago,
  dollars,
  duration,
  plural,
  utcDate,
  when,
} from "@/lib/model/format";
import { WEEK } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";
import { windowPace } from "@/lib/model/pace";
import type { Pace } from "@/lib/model/pace";
import { creditTone, windowTone } from "@/lib/model/tone";
import type { Outcome } from "@/lib/proxy/attempt";
import type { LimitWindow } from "@/lib/proxy/schema";
import { cn } from "@/lib/utils";

const states = {
  cooling: { dot: "bg-over", label: "Cooling down" },
  disabled: { dot: "bg-faint", label: "Disabled" },
  empty: { dot: "bg-bad", label: "Empty" },
  error: { dot: "bg-bad", label: "Error" },
  limited: { dot: "bg-bad", label: "Locked" },
  low: { dot: "bg-over", label: "Running low" },
  next: { dot: "bg-brand", label: "Takes new work" },
  open: { dot: "bg-ok", label: "Has room" },
  "sign-in": { dot: "bg-over", label: "Needs sign-in" },
} as const satisfies Record<State["is"], { dot: string; label: string }>;

const StateChip = ({ state, now }: { state: State; now: number }) => (
  <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
    <span className={cn("size-2 rounded-full", states[state.is].dot)} />
    {state.is === "limited" && state.until !== null
      ? `Locked until ${when(state.until, now)}`
      : states[state.is].label}
  </span>
);

const Window = ({
  label,
  hint,
  window,
  pace = null,
  now,
}: {
  label: string;
  hint?: string;
  window: LimitWindow;
  pace?: Pace | null;
  now: number;
}) => {
  const locked = window.used !== null && window.used >= window.cutoff;

  const note = () => {
    if (window.resetsAt === null) {
      return "No reading";
    }

    const runsOut = pace?.runsOut ?? null;

    if (runsOut !== null && !locked) {
      return <span className="text-over">Runs out {when(runsOut, now)}</span>;
    }

    return locked
      ? `Back ${when(window.resetsAt, now)}`
      : `Resets in ${duration(window.resetsAt - now)}`;
  };

  return (
    <Stat
      label={label}
      hint={hint}
      value={window.used === null ? "—" : Math.round(window.used)}
      unit={window.used === null ? undefined : "%"}
    >
      {locked ? (
        <div className="h-2 rounded-full" style={hatchStyle} />
      ) : (
        <Meter value={window.used ?? 0} tone={windowTone(window, pace)} />
      )}
      <p className="text-sm text-muted-foreground">{note()}</p>
    </Stat>
  );
};

const Resets = ({ row, now }: { row: Row; now: number }) => {
  const banked = resets([row], now - WEEK);

  if (
    banked.held === 0 &&
    banked.spent.length === 0 &&
    banked.plans.length === 0
  ) {
    return null;
  }

  return (
    <Stat label="Resets" hint="held" value={banked.held}>
      {banked.firstExpiry === null ? null : (
        <p className="text-sm text-muted-foreground">
          First expires in {duration(banked.firstExpiry - now)}
        </p>
      )}
      {banked.plans.map((plan) => (
        <p key={plan} className="text-sm">
          {plan}
        </p>
      ))}
      {banked.spent.map((spent) => (
        <p key={spent.at} className="text-sm text-muted-foreground">
          Pool spent one {when(spent.at, now)}
        </p>
      ))}
    </Stat>
  );
};

const Actions = ({
  login,
  name,
  working,
  needsSignIn,
}: {
  login: Login;
  name: string;
  working: number;
  needsSignIn: boolean;
}) => {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const act = (
    task: () => Promise<Outcome<unknown>>,
    done: string | null = null
  ) => {
    setNotice(null);
    startTransition(async () => {
      const result = await task();

      setNotice(result.ok ? done : result.reason);
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {notice === null ? null : (
        <output className="mr-auto text-sm text-muted-foreground">
          {notice}
        </output>
      )}
      {needsSignIn ? (
        <SignIn
          provider={login.provider === "codex" ? "codex" : "claude"}
          target={login.name}
          trigger={<Button size="sm">Sign in again</Button>}
        />
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          act(async () => await setDisabled(login.name, !login.disabled));
        }}
      >
        {login.disabled ? <PlayIcon /> : <PauseIcon />}
        {login.disabled ? "Enable" : "Disable"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          act(async () => await renewCredential(login.name), "Refreshed");
        }}
      >
        <RotateCwIcon />
        Refresh
      </Button>
      <Dialog>
        <DialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="text-bad hover:text-bad"
              disabled={pending}
            />
          }
        >
          Remove
        </DialogTrigger>
        <DialogContent className="p-5">
          <DialogHeader>
            <DialogTitle>Remove {name}?</DialogTitle>
            <DialogDescription>
              {working > 0
                ? `Its ${plural(working, "working agent")} move to other accounts. `
                : ""}
              To use it again, you sign in again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Keep</DialogClose>
            <DialogClose
              render={<Button variant="destructive" />}
              onClick={() => {
                act(async () => await removeCredential(login.name));
              }}
            >
              Remove
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Card = ({
  row,
  now,
  title,
  subtitle,
  children,
  facts,
}: {
  row: Row;
  now: number;
  title: ReactNode;
  subtitle: string | null;
  children?: ReactNode;
  facts: readonly string[];
}) => {
  const sampled = row.account?.week.sampledAt ?? null;

  const message =
    row.state.is === "error" || row.state.is === "cooling"
      ? row.state.message
      : null;

  return (
    <article
      id={row.account?.id}
      className={cn(
        "scroll-mt-6 rounded-3xl border bg-card p-5 target:border-foreground/40 sm:p-6",
        row.state.is === "disabled" && "bg-transparent"
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="truncate text-base font-medium">{title}</h3>
          {subtitle === null || subtitle === "" ? null : (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <StateChip state={row.state} now={now} />
          {sampled === null ? null : (
            <span className="text-sm text-muted-foreground">
              · {ago(sampled, now)}
            </span>
          )}
        </div>
      </header>
      {message === null || message === "" ? null : (
        <p className="mt-1 text-sm text-bad">{message}</p>
      )}
      {children === undefined ? null : (
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
          {children}
        </div>
      )}
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
        {row.login === null ? null : (
          <Actions
            login={row.login}
            name={row.name}
            working={row.account?.working ?? 0}
            needsSignIn={row.state.is === "sign-in"}
          />
        )}
      </footer>
    </article>
  );
};

const working = (row: Row) =>
  row.account === null ? [] : [`${row.account.working} working`];

export const AccountCard = ({
  row,
  points,
  now,
}: {
  row: Row;
  points: Points;
  now: number;
}) => {
  const { account, credit } = row;

  if (credit !== null) {
    return (
      <Card
        row={row}
        now={now}
        title={row.name}
        subtitle={credit.organization}
        facts={[
          ...working(row),
          credit.lastRequestAt === null
            ? "No requests yet"
            : `Last request ${ago(credit.lastRequestAt, now)}`,
          "Set in the proxy config",
        ]}
      >
        <Stat
          label="Balance"
          value={dollars(Math.max(0, credit.remaining))}
          unit={`of ${dollars(credit.allowance)}`}
          className="col-span-2 sm:col-span-1"
        >
          <Meter
            value={(Math.max(0, credit.remaining) / credit.allowance) * 100}
            tone={creditTone(credit.remaining, credit.allowance)}
          />
          <a
            href="https://platform.claude.com/settings/billing"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Estimate · exact balance in Console ↗
          </a>
        </Stat>
        <Stat label="Spent" hint="via proxy" value={dollars(credit.spent)}>
          <p className="text-sm text-muted-foreground">
            {plural(credit.requests, "request")}
          </p>
        </Stat>
        <Stat label="Expires" value={utcDate(credit.expiresAt)} unit="UTC" />
      </Card>
    );
  }

  const signedIn =
    account?.signInUntil === null || account?.signInUntil === undefined
      ? []
      : [`Signed in until ${when(account.signInUntil, now)}`];

  return (
    <Card
      row={row}
      now={now}
      title={
        <>
          {row.name}
          {account === null || account.plan === "" ? null : (
            <span className="text-muted-foreground"> · {account.plan}</span>
          )}
        </>
      }
      subtitle={row.login?.login ?? account?.label ?? null}
      facts={[...working(row), ...signedIn]}
    >
      {account === null ? undefined : (
        <>
          <Window
            label="Session"
            hint="5 hours"
            window={account.fiveHour}
            now={now}
          />
          <Window
            label="Weekly"
            window={account.week}
            pace={windowPace(account.week, points, now)}
            now={now}
          />
          <Resets row={row} now={now} />
        </>
      )}
    </Card>
  );
};
