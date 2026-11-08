"use client";

import { XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Side, Tools } from "@/features/files/bench";
import { CopyButton } from "@/features/files/copy-button";
import { FileBar } from "@/features/files/file-bar";
import { Review } from "@/features/files/review";
import { StylePills } from "@/features/files/style-pills";
import { ago, timeOfDay } from "@/features/files/time";
import { filesHref } from "@/features/files/urls";
import { dayGroups } from "@/lib/files/files";
import type { Commit } from "@/lib/files/files";
import { cn } from "@/lib/utils";

export const HistoryView = ({
  ws,
  path,
  commits,
  picked,
  patch,
  added,
  removed,
  now,
}: {
  ws: string;
  path: string;
  commits: readonly Commit[];
  picked: Commit | null;
  patch: string;
  added: number;
  removed: number;
  now: number;
}) => {
  const [filter, setFilter] = useState("");
  const [showBody, setShowBody] = useState(false);
  const needle = filter.trim().toLowerCase();

  const shown = commits.filter(
    (commit) =>
      needle === "" ||
      commit.subject.toLowerCase().includes(needle) ||
      commit.sha.startsWith(needle),
  );

  return (
    <>
      <Side title="Commits">
        <div className="space-y-2 p-2">
          <input
            type="search"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
            }}
            placeholder="Filter commits"
            aria-label="Filter commits"
            className="h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {path !== "" && (
            <div className="flex items-center gap-1 rounded-lg bg-muted py-1 pr-1 pl-2.5 text-xs">
              <span className="truncate">{path}</span>
              <Link
                href={filesHref.history(ws, picked?.sha ?? "")}
                aria-label="Every commit"
                className="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </Link>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {dayGroups(shown, new Date(now)).map((group) => (
            <section key={group.day}>
              <h3 className="sticky top-0 bg-card px-2 pt-3 pb-1 text-xs text-muted-foreground">
                {group.day}
              </h3>
              <ol>
                {group.commits.map((commit) => (
                  <li key={commit.sha}>
                    <Link
                      href={filesHref.history(ws, commit.sha, path)}
                      replace
                      scroll={false}
                      aria-current={commit.sha === picked?.sha ? "page" : undefined}
                      className="block rounded-lg px-2 py-1.5 hover:bg-muted aria-[current=page]:bg-accent"
                    >
                      <span className="line-clamp-2 text-[13px] leading-snug">
                        {commit.subject}
                      </span>
                      <span className="mt-0.5 flex gap-2 text-xs text-faint tabular-nums">
                        <span>{timeOfDay(commit.at)}</span>
                        <span className="font-mono">{commit.short}</span>
                        {!commit.signed && <span className="text-bad">unsigned</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </Side>
      <div className="flex min-w-0 flex-1 flex-col">
        {picked === null ? (
          <p className="m-auto p-6 text-sm text-muted-foreground">No commits yet.</p>
        ) : (
          <>
            <FileBar>
              <button
                type="button"
                onClick={() => {
                  setShowBody(!showBody);
                }}
                disabled={picked.body === ""}
                aria-expanded={showBody}
                className="min-w-0 truncate text-left font-medium enabled:hover:underline"
              >
                {picked.subject}
              </button>
              <span className="flex shrink-0 items-center gap-2 text-faint tabular-nums max-md:hidden">
                <span>{ago(picked.at, now)}</span>
                <span className="font-mono">{picked.short}</span>
              </span>
              {!picked.signed && <span className="shrink-0 text-bad">Unsigned</span>}
              <span className="ml-auto flex shrink-0 gap-1.5 tabular-nums max-sm:hidden">
                <span className="text-ok">+{added.toLocaleString("en-US")}</span>
                <span className="text-bad">−{removed.toLocaleString("en-US")}</span>
              </span>
              <Tools>
                <StylePills />
                <CopyButton text={picked.sha} label="Copy commit hash" />
              </Tools>
            </FileBar>
            {showBody && (
              <p
                className={cn(
                  "shrink-0 border-b px-4 py-3 text-sm whitespace-pre-wrap text-muted-foreground",
                )}
              >
                {picked.body}
              </p>
            )}
            {patch === "" ? (
              <p className="m-auto p-6 text-sm text-muted-foreground">No file changes.</p>
            ) : (
              <Review ws={ws} sha={picked.sha} patch={patch} focus={path} />
            )}
          </>
        )}
      </div>
    </>
  );
};
