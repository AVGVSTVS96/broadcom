"use client";

import {
  CornerDownRightIcon,
  EllipsisIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  Trash2Icon,
} from "lucide-react";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  removeCredential,
  renewCredential,
  setDisabled,
} from "@/features/accounts/actions";
import { SignIn } from "@/features/accounts/sign-in";
import { needsYou } from "@/lib/model/accounts";
import type { Entry, Login, Row, State } from "@/lib/model/accounts";
import { ago, dollars, plural, utcDate, when } from "@/lib/model/format";
import { DAY } from "@/lib/model/history";
import type { Outcome } from "@/lib/proxy/attempt";
import { cn } from "@/lib/utils";

const soon = 2 * DAY;

const states = {
  cooling: { dot: "bg-over", label: "Cooling down" },
  disabled: { dot: "bg-faint", label: "Disabled" },
  empty: { dot: "bg-bad", label: "Empty" },
  error: { dot: "bg-bad", label: "Sign-in failed" },
  limited: { dot: "bg-bad", label: "Locked" },
  low: { dot: "bg-over", label: "Running low" },
  next: { dot: "bg-brand", label: "Takes new work" },
  open: { dot: "bg-ok", label: "Has room" },
  "sign-in": { dot: "bg-over", label: "Signed out" },
} as const satisfies Record<State["is"], { dot: string; label: string }>;

const Fact = ({
  label,
  children,
  note,
  className,
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
  className?: string;
}) => (
  <div className={cn("min-w-0", className)}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm tabular-nums sm:truncate">{children}</div>
    {note === undefined ? null : (
      <div className="truncate text-xs text-muted-foreground">{note}</div>
    )}
  </div>
);

const stateNote = (state: State, now: number) => {
  if (state.is === "limited") {
    return state.until === null ? undefined : `Back ${when(state.until, now)}`;
  }

  return state.is === "error" || state.is === "cooling"
    ? state.message
    : undefined;
};

const Status = ({
  state,
  now,
  note,
}: {
  state: State;
  now: number;
  note?: ReactNode;
}) => (
  <Fact label="Status" note={note ?? stateNote(state, now)}>
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", states[state.is].dot)} />
      {states[state.is].label}
    </span>
  </Fact>
);

const Line = ({
  who,
  facts,
  actions,
  notice,
  nested = false,
}: {
  who: ReactNode;
  facts: ReactNode;
  actions?: ReactNode;
  notice?: string | null;
  nested?: boolean;
}) => (
  <div
    className={cn(
      "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,3fr)_2rem] sm:items-center sm:px-6",
      nested && "pt-0 sm:pt-0"
    )}
  >
    <div className={cn("min-w-0", nested && "pl-4 sm:pl-6")}>{who}</div>
    <div className="col-span-2 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] gap-4 sm:col-span-1 sm:grid-cols-3">
      {facts}
    </div>
    <div className="col-start-2 row-start-1 flex justify-end sm:col-start-3">
      {actions}
    </div>
    {notice === null || notice === undefined ? null : (
      <output className="col-span-full text-sm text-muted-foreground">
        {notice}
      </output>
    )}
  </div>
);

const Actions = ({
  login,
  name,
  working,
  onNotice,
}: {
  login: Login;
  name: string;
  working: number;
  onNotice: (notice: string | null) => void;
}) => {
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState(false);

  const act = (
    task: () => Promise<Outcome<unknown>>,
    done: string | null = null
  ) => {
    onNotice(null);
    startTransition(async () => {
      const result = await task();

      onNotice(result.ok ? done : result.reason);
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
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              act(async () => await setDisabled(login.name, !login.disabled));
            }}
          >
            {login.disabled ? <PlayIcon /> : <PauseIcon />}
            {login.disabled ? "Enable" : "Disable"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              act(
                async () => await renewCredential(login.name),
                "Sign-in refreshed"
              );
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
                act(async () => await removeCredential(login.name));
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

const LoginLine = ({ row, now }: { row: Row; now: number }) => {
  const [notice, setNotice] = useState<string | null>(null);
  const { account, login } = row;
  const until = account?.signInUntil ?? null;
  const ending = until !== null && until - now < soon;
  const next = row.state.is === "next";

  return (
    <Line
      notice={notice}
      who={
        <>
          <div className="flex items-center gap-2 truncate">
            {next ? (
              <span className="size-2 shrink-0 rounded-full bg-brand" />
            ) : null}
            <span className={cn("truncate", next && "text-brand")}>
              {row.name}
            </span>
            {account === null || account.plan === "" ? null : (
              <span className="shrink-0 text-muted-foreground">
                {account.plan}
              </span>
            )}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {login?.login ?? account?.label}
          </div>
        </>
      }
      facts={
        <>
          <Status state={row.state} now={now} />
          <Fact
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
            <span className={cn(ending && "text-over")}>
              {until === null ? "–" : when(until, now)}
            </span>
          </Fact>
        </>
      }
      actions={
        login === null ? null : (
          <Actions
            login={login}
            name={row.name}
            working={account?.working ?? 0}
            onNotice={setNotice}
          />
        )
      }
    />
  );
};

const KeyLine = ({
  row,
  now,
  nested,
}: {
  row: Row;
  now: number;
  nested: boolean;
}) => {
  const { credit } = row;

  if (credit === null) {
    return null;
  }

  return (
    <Line
      nested={nested}
      who={
        <>
          <div className="flex items-center gap-1.5 truncate">
            {nested ? (
              <CornerDownRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : null}
            <span className="truncate">{row.name}</span>
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {credit.lastRequestAt === null
              ? "No requests yet"
              : `Last request ${ago(credit.lastRequestAt, now)}`}
          </div>
        </>
      }
      facts={
        <>
          <Status
            state={row.state}
            now={now}
            note={
              <a
                href="https://platform.claude.com/settings/billing"
                target="_blank"
                rel="noreferrer"
                className="-my-2 inline-block py-2 underline-offset-4 hover:underline"
              >
                Console balance ↗
              </a>
            }
          />
          <Fact
            label="Spent via proxy"
            note={plural(credit.requests, "request")}
          >
            {dollars(credit.spent)}
          </Fact>
          <Fact label="Expires">
            {utcDate(credit.expiresAt)}
            <span className="ml-1 text-xs text-muted-foreground">UTC</span>
          </Fact>
        </>
      }
    />
  );
};

export const LedgerEntry = ({ entry, now }: { entry: Entry; now: number }) => (
  <div
    id={entry.row.account?.id ?? entry.row.key}
    className="scroll-mt-6 target:bg-muted/50"
  >
    {entry.row.credit === null ? (
      <LoginLine row={entry.row} now={now} />
    ) : (
      <KeyLine row={entry.row} now={now} nested={false} />
    )}
    {entry.keys.map((key) => (
      <KeyLine key={key.key} row={key} now={now} nested />
    ))}
  </div>
);
