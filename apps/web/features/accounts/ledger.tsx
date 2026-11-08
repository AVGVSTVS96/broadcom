"use client";

import { EllipsisIcon, PauseIcon, PlayIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hatchStyle } from "@/components/viz/hatch";
import { fills, texts } from "@/components/viz/meter";
import { removeCredential, renewCredential, setDisabled } from "@/features/accounts/actions";
import { SignIn } from "@/features/accounts/sign-in";
import { endsSoon, needsYou } from "@/lib/model/accounts";
import type { Login, Row, State } from "@/lib/model/accounts";
import { ago, dollars, percent, plural, utcDate, when } from "@/lib/model/format";
import { creditTone, windowTone } from "@/lib/model/tone";
import type { Tone } from "@/lib/model/tone";
import type { Outcome } from "@/lib/proxy/attempt";
import type { LimitWindow } from "@/lib/proxy/schema";
import { cn } from "@/lib/utils";

const dots = {
  cooling: "bg-over",
  disabled: "bg-faint",
  empty: "bg-bad",
  error: "bg-bad",
  limited: "bg-bad",
  low: "bg-over",
  next: "bg-brand",
  open: "bg-ok",
  "sign-in": "bg-over",
} as const satisfies Record<State["is"], string>;

const labels = {
  cooling: "Rate limited",
  disabled: "Disabled",
  empty: "Used up",
  error: "Sign-in failed",
  limited: "Weekly limit hit",
  low: "Running low",
  next: "Takes new work",
  open: "Has room",
  "sign-in": "Needs sign-in",
} as const satisfies Record<State["is"], string>;

const labelOf = (state: State) =>
  state.is === "limited" && state.window === "session" ? "Session limit hit" : labels[state.is];

const Cell = ({
  label,
  value,
  note,
  className,
  children,
}: {
  label: string;
  value?: ReactNode;
  note?: ReactNode;
  className?: string;
  children?: ReactNode;
}) => (
  <div className={cn("min-w-0 space-y-1.5", className)}>
    <div className="flex h-5 items-center justify-between gap-2 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      {value === undefined ? null : <span className="text-sm tabular-nums">{value}</span>}
    </div>
    {children}
    {note === undefined ? null : (
      <div className="truncate text-xs text-muted-foreground">{note}</div>
    )}
  </div>
);

const Bar = ({ value, tone, locked = false }: { value: number; tone: Tone; locked?: boolean }) => (
  <div
    className="h-1.5 overflow-hidden rounded-full bg-track"
    style={locked ? hatchStyle : undefined}
  >
    {locked ? null : (
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", fills[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    )}
  </div>
);

const Line = ({
  id,
  name,
  state,
  plan,
  note,
  first,
  second,
  actions,
}: {
  id: string;
  name: string;
  state: State;
  plan?: string | undefined;
  note?: string | undefined;
  first: ReactNode;
  second: ReactNode;
  actions?: ReactNode;
}) => (
  <div
    id={id}
    className="grid scroll-mt-6 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-start gap-x-5 gap-y-3 py-4 target:-mx-3 target:rounded-lg target:bg-muted/50 target:px-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_2rem] sm:gap-x-6"
  >
    <div className="col-span-2 min-w-0 sm:col-span-1">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", dots[state.is])} />
        <span className={cn("truncate", state.is === "next" && "text-brand")}>{name}</span>
        {plan === undefined || plan === "" ? null : (
          <span className="shrink-0 text-sm text-muted-foreground">{plan}</span>
        )}
      </div>
      <div className="truncate pl-4 text-sm text-muted-foreground">
        {[labelOf(state), note].filter(Boolean).join(" · ")}
      </div>
    </div>
    <div className="col-span-3 min-w-0 sm:col-span-1">{first}</div>
    <div className="col-span-3 min-w-0 sm:col-span-1">{second}</div>
    <div className="col-start-3 row-start-1 -mt-1 flex justify-end sm:col-start-4">{actions}</div>
  </div>
);

const Actions = ({ login, name, working }: { login: Login; name: string; working: number }) => {
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);

  const act = (task: () => Promise<Outcome<unknown>>, done: string) => {
    startTransition(async () => {
      const result = await task();

      if (result.ok) {
        toast.success(done);
      } else {
        toast.error(result.reason);
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Manage ${name}`}
              disabled={pending}
            />
          }
        >
          {pending ? <RotateCwIcon className="animate-spin" /> : <EllipsisIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              act(
                async () => await setDisabled(login.name, !login.disabled),
                login.disabled ? `${name} is enabled` : `${name} is disabled`,
              );
            }}
          >
            {login.disabled ? <PlayIcon /> : <PauseIcon />}
            {login.disabled ? "Enable" : "Disable"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              act(async () => await renewCredential(login.name), `${name}'s sign-in is refreshed`);
            }}
          >
            <RotateCwIcon />
            Refresh sign-in
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setRemoving(true);
            }}
          >
            <Trash2Icon />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent className="p-5">
          <DialogHeader>
            <DialogTitle>Remove {name}?</DialogTitle>
            <DialogDescription>
              {working > 0
                ? `Its ${plural(working, "active session")} move to other accounts. `
                : ""}
              To use it again, sign in again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Keep</DialogClose>
            <DialogClose
              render={<Button variant="destructive" />}
              onClick={() => {
                act(async () => await removeCredential(login.name), `${name} is removed`);
              }}
            >
              Remove
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const planNote = (row: Row) => {
  const { state, account } = row;

  if (state.is === "error") {
    return state.message;
  }

  return account !== null && account.working > 0 ? `${account.working} active` : undefined;
};

const UsageWindow = ({
  label,
  window,
  now,
}: {
  label: string;
  window: LimitWindow | null;
  now: number;
}) => {
  if (window === null || window.used === null) {
    return <Cell label={label} value="–" note="No reading" />;
  }

  const locked = window.used >= window.cutoff;
  const tone = windowTone(window);

  return (
    <Cell
      label={label}
      value={
        <span className={tone === "ok" ? undefined : texts[tone]}>{percent(window.used)}</span>
      }
      note={
        window.resetsAt === null
          ? "No reset time"
          : `${locked ? "Back" : "Resets"} ${when(window.resetsAt, now)}`
      }
    >
      <Bar value={window.used} tone={tone} locked={locked} />
    </Cell>
  );
};

const SignedIn = ({ row, now }: { row: Row; now: number }) => {
  const { login } = row;
  const until = row.account?.signInUntil ?? null;
  const ending = endsSoon(row, now);

  return (
    <Cell
      label="Signed in until"
      note={
        login !== null && (needsYou(row) || ending) ? (
          <SignIn
            provider={login.provider === "codex" ? "codex" : "claude"}
            target={login.name}
            trigger={
              <button
                type="button"
                className="-my-2 inline-block py-2 text-foreground underline underline-offset-4"
              >
                Sign in again
              </button>
            }
          />
        ) : undefined
      }
    >
      <div className={cn("text-sm tabular-nums", ending && "text-over")}>
        {until === null ? "–" : when(until, now)}
      </div>
    </Cell>
  );
};

export const PlanLine = ({ row, now }: { row: Row; now: number }) => {
  const { account, login } = row;

  return (
    <Line
      id={account?.id ?? row.key}
      name={row.name}
      state={row.state}
      plan={account?.plan}
      note={planNote(row)}
      first={
        <div className="space-y-3">
          <UsageWindow label="5-hour used" window={account?.fiveHour ?? null} now={now} />
          <UsageWindow label="Weekly used" window={account?.week ?? null} now={now} />
        </div>
      }
      second={<SignedIn row={row} now={now} />}
      actions={
        login === null ? null : (
          <Actions login={login} name={row.name} working={account?.working ?? 0} />
        )
      }
    />
  );
};

export const CreditLine = ({ row, now }: { row: Row; now: number }) => {
  const { credit } = row;

  if (credit === null) {
    return null;
  }

  const tone = creditTone(credit.remaining, credit.allowance);

  return (
    <Line
      id={row.key}
      name={row.name}
      state={row.state}
      note={row.account === null ? "out of the pool" : "in the pool"}
      first={
        <Cell
          label="Left"
          value={
            <span className={tone === "ok" ? undefined : texts[tone]}>
              {dollars(credit.remaining)}
            </span>
          }
          note={`of ${dollars(credit.allowance)}`}
        >
          <Bar value={(credit.remaining / credit.allowance) * 100} tone={tone} />
        </Cell>
      }
      second={
        <Cell
          label="Ends"
          note={
            credit.lastRequestAt === null
              ? "Not used yet"
              : `Last used ${ago(credit.lastRequestAt, now)}`
          }
        >
          <div className="text-sm tabular-nums">
            {utcDate(credit.expiresAt)}
            <span className="ml-1 text-xs text-muted-foreground">UTC</span>
          </div>
        </Cell>
      }
    />
  );
};
