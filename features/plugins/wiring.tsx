"use client";

import Link from "next/link";

import { Section } from "@/components/viz/section";
import { filesHref } from "@/features/files/urls";
import { useLive } from "@/lib/live/client";
import type { Channel } from "@/lib/model/setup";
import { cn } from "@/lib/utils";

const names = new Map([
  ["buzz", "Buzz"],
  ["discord", "Discord"],
  ["t3", "T3 Code"],
  ["telegram", "Telegram"],
  ["voice", "Voice"],
]);

const y = (index: number, count: number) => ((index + 0.5) / count) * 100;

const day = 86_400_000;

export interface Load {
  readonly name: string;
  readonly value: string;
  readonly href: string;
}

const Wires = ({
  from,
  to,
  lit,
}: {
  from: number;
  to: number;
  lit: readonly ("on" | "busy" | "off")[];
}) => (
  <svg
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden
    className="h-full w-full max-md:hidden"
  >
    {lit.map((state, index) => {
      const start = from === 1 ? 50 : y(index, from);
      const end = to === 1 ? 50 : y(index, to);

      return (
        <path
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          d={`M0 ${start} C50 ${start} 50 ${end} 100 ${end}`}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth={state === "off" ? 1 : 1.5}
          strokeDasharray={state === "off" ? "3 4" : undefined}
          className={cn(
            state === "busy" && "stroke-ok",
            state === "on" && "stroke-foreground/40",
            state === "off" && "stroke-faint"
          )}
        />
      );
    })}
  </svg>
);

const note = (row: {
  channel: Channel;
  threads: number;
  working: number;
  waiting: number;
}) => {
  if (row.channel.state === "set up") {
    return "Set up, hub not connected";
  }

  if (row.channel.state !== "connected") {
    return "Installed, never set up";
  }

  return [
    `${row.threads} ${row.threads === 1 ? "thread" : "threads"}`,
    row.working > 0 ? `${row.working} working` : null,
    row.waiting > 0 ? `${row.waiting} waiting on you` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
};

export const Wiring = ({
  channels,
  loads,
  now,
}: {
  channels: readonly Channel[];
  loads: readonly Load[];
  now: number;
}) => {
  const sessions = useLive((live) => live.sessions);
  const threads = Object.values(sessions).filter((each) => each.app !== null);

  const rows = channels.map((channel) => {
    const mine = threads.filter((each) => each.app === channel.name);

    return {
      channel,
      threads: mine.length,
      waiting: mine.filter(
        (each) => each.state === "blocked" && each.since >= now - day
      ).length,
      working: mine.filter((each) => each.state === "working").length,
    };
  });

  const connected = channels.filter((each) => each.state === "connected");
  const working = rows.reduce((sum, row) => sum + row.working, 0);

  return (
    <Section
      title={`${connected.length} of ${channels.length} channels reach hex, ${threads.length} threads open`}
      detail="Each channel hands its threads to the hub, which runs one Claude Code session per thread."
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_4rem_12rem_4rem_minmax(0,1fr)] md:gap-0">
        <ul className="grid auto-rows-fr">
          {rows.map((row) => (
            <li key={row.channel.id} className="flex py-1">
              <div className="flex min-h-14 flex-1 items-center gap-3 rounded-2xl bg-muted/60 px-4 py-2.5">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    row.channel.state === "connected" ? "bg-ok" : "bg-faint"
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="font-medium">
                      {names.get(row.channel.name) ?? row.channel.name}
                    </span>
                    {row.channel.version !== null && (
                      <span className="font-mono text-xs text-faint">
                        {row.channel.version}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {note(row)}
                  </span>
                </span>
                {row.channel.source !== null && (
                  <Link
                    href={filesHref.code(
                      row.channel.source.ws,
                      row.channel.source.file
                    )}
                    className="hit shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Source
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <Wires
          from={rows.length}
          to={1}
          lit={rows.map((row) => {
            if (row.channel.state !== "connected") {
              return "off";
            }

            return row.working > 0 ? "busy" : "on";
          })}
        />
        <div className="flex flex-col items-center justify-center self-center rounded-2xl border bg-card px-4 py-6 text-center">
          <span className="text-sm font-medium">hex hub</span>
          <span className="mt-2 text-4xl font-light tracking-tight tabular-nums">
            {threads.length}
          </span>
          <span className="text-xs text-muted-foreground">
            sessions{working > 0 ? `, ${working} working` : ""}
          </span>
        </div>
        <Wires from={1} to={loads.length} lit={loads.map(() => "on")} />
        <ul className="grid auto-rows-fr">
          {loads.map((load) => (
            <li key={load.name} className="flex py-1">
              <a
                href={load.href}
                className="flex min-h-11 flex-1 items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-2 text-sm hover:bg-muted"
              >
                <span>{load.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {load.value}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
};
