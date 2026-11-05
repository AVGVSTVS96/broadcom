"use client";

import type { FileTreeRowDecoration, GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useEffectEvent, useRef } from "react";

import type { Change } from "@/lib/model/files";

const ancestors = (file: string) => {
  const parts = file.split("/").slice(0, -1);

  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
};

const look = `
  :host {
    --trees-bg-override: transparent;
    --trees-font-family-override: "Helvetica Neue", Helvetica, Arial, sans-serif;
    --trees-font-size-override: 13px;
    --trees-border-radius-override: 8px;
    --trees-git-added-color-override: var(--ok);
    --trees-git-untracked-color-override: var(--ok);
    --trees-git-modified-color-override: var(--over);
    --trees-git-deleted-color-override: var(--bad);
    --trees-selected-bg-override: var(--accent);
  }
  [data-file-tree-search-container] { padding: 8px 8px 6px; }
  [data-file-tree-search-input] { border-radius: 8px; height: 30px; }
`;

const counts = (change: Change): FileTreeRowDecoration | null =>
  change.added === 0 && change.removed === 0
    ? null
    : {
        parts: [
          ...(change.added > 0
            ? [{ color: "var(--ok)", text: `+${change.added}` }]
            : []),
          ...(change.removed > 0
            ? [{ color: "var(--bad)", text: ` −${change.removed}` }]
            : []),
        ],
        text: `+${change.added} −${change.removed}`,
      };

const closed: readonly string[] = [];

export const Tree = ({
  paths,
  changes,
  selected,
  onPick,
  open = closed,
  showCounts = false,
}: {
  paths: readonly string[];
  changes: readonly Change[];
  selected: string;
  onPick: (file: string) => void;
  open?: readonly string[];
  showCounts?: boolean;
}) => {
  const known = useRef<Set<string> | null>(null);
  const byPath = useRef(new Map<string, Change>());
  const latest = useRef({ onPick, selected });

  useEffect(() => {
    latest.current = { onPick, selected };
  }, [onPick, selected]);

  const { model } = useFileTree({
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    initialExpansion: "closed",
    onSelectionChange: (picked) => {
      const [file] = picked;

      if (
        file !== undefined &&
        file !== latest.current.selected &&
        known.current?.has(file) === true
      ) {
        latest.current.onPick(file);
      }
    },
    paths: [],
    renderRowDecoration: ({ item }) => {
      const change = byPath.current.get(item.path);

      return showCounts && change !== undefined ? counts(change) : null;
    },
    search: true,
    unsafeCSS: look,
  });

  const startOpen = useEffectEvent(() => [
    ...new Set([...open, selected].flatMap(ancestors)),
  ]);

  useEffect(() => {
    const previous = known.current;
    const next = new Set(paths);

    known.current = next;

    if (previous === null) {
      model.resetPaths(paths, { initialExpandedPaths: startOpen() });

      return;
    }

    const removed = [...previous].flatMap((file) =>
      next.has(file) ? [] : [{ path: file, type: "remove" as const }]
    );

    const added = paths.flatMap((file) =>
      previous.has(file) ? [] : [{ path: file, type: "add" as const }]
    );

    if (removed.length > 0 || added.length > 0) {
      model.batch([...removed, ...added]);
    }
  }, [model, paths]);

  useEffect(() => {
    byPath.current = new Map(changes.map((change) => [change.path, change]));
    model.setGitStatus(
      changes.map((change): GitStatusEntry => ({
        path: change.path,
        status: change.status,
      }))
    );
  }, [model, changes]);

  useEffect(() => {
    for (const file of model.getSelectedPaths()) {
      if (file !== selected) {
        model.getItem(file)?.deselect();
      }
    }

    if (selected === "") {
      return;
    }

    for (const dir of ancestors(selected)) {
      const folder = model.getItem(dir) ?? model.getItem(`${dir}/`);

      if (folder !== null && "expand" in folder && !folder.isExpanded()) {
        folder.expand();
      }
    }

    const item = model.getItem(selected);

    if (item !== null && !item.isSelected()) {
      item.select();
      model.scrollToPath(item.getPath(), { focus: false, offset: "nearest" });
    }
  }, [model, selected]);

  return <FileTree model={model} className="min-h-0 flex-1" />;
};
