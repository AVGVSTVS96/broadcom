"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SideToggle, ToolSlot } from "@/features/files/bench";
import { Count, PillLink, Pills } from "@/features/files/pills";
import { ago } from "@/features/files/time";
import { filesHref, parseFilesPath } from "@/features/files/urls";
import type { View } from "@/features/files/urls";

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly live: boolean;
  readonly at: number;
}

export interface RepoPlaces {
  readonly id: string;
  readonly name: string;
  readonly places: readonly Place[];
}

const sideLabels: Record<View, string> = {
  changes: "changed files",
  code: "files",
  history: "commits",
};

export const FilesBar = ({
  repos,
  changed,
}: {
  repos: readonly RepoPlaces[];
  changed: number;
}) => {
  const { ws, view, file } = parseFilesPath(usePathname());
  const [repoId] = ws.split("~");
  const repo = repos.find((each) => each.id === repoId);
  const place = repo?.places.find((each) => each.id === ws);

  const target = (id: string) => {
    const sameRepo = id.startsWith(`${repoId}~`) || id === repoId;

    if (view === "changes") {
      return filesHref.changes(id);
    }

    if (view === "history") {
      return filesHref.history(id);
    }

    return filesHref.code(id, sameRepo ? file : "");
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b px-2 sm:gap-2">
      <SideToggle label={sideLabels[view]} />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-muted aria-expanded:bg-muted">
          <span className="shrink-0 font-medium">{repo?.name}</span>
          <span className="truncate text-muted-foreground">{place?.name}</span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-[min(32rem,var(--available-height))] w-72">
          {repos.map((each, index) => (
            <DropdownMenuGroup key={each.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{each.name}</DropdownMenuLabel>
              {each.places.map((option) => (
                <DropdownMenuLinkItem
                  key={option.id}
                  render={<Link href={target(option.id)} />}
                  aria-current={option.id === ws ? "page" : undefined}
                  className="aria-[current=page]:bg-accent"
                >
                  <span className="truncate">{option.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {option.live ? "live" : ago(option.at)}
                  </span>
                </DropdownMenuLinkItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Pills label="View">
        <PillLink href={filesHref.code(ws)} current={view === "code"}>
          Code
        </PillLink>
        <PillLink href={filesHref.changes(ws)} current={view === "changes"}>
          Changes
          {changed > 0 && <Count>{changed}</Count>}
        </PillLink>
        <PillLink href={filesHref.history(ws)} current={view === "history"}>
          History
        </PillLink>
      </Pills>
      <ToolSlot />
    </header>
  );
};
