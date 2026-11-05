"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Side, Tools, usePickedInSide } from "@/features/files/bench";
import { FileBar } from "@/features/files/file-bar";
import { Review } from "@/features/files/review";
import { StylePills } from "@/features/files/style-pills";
import { Tree } from "@/features/files/tree";
import { filesHref } from "@/features/files/urls";
import type { Change } from "@/lib/model/files";

const many = (count: number, word: string) =>
  `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

export const ChangesView = ({
  ws,
  where,
  files,
  patch,
  left,
  ahead,
  behind,
}: {
  ws: string;
  where: string;
  files: readonly Change[];
  patch: string;
  left: readonly string[];
  ahead: number;
  behind: number;
}) => {
  const router = useRouter();
  const closeSide = usePickedInSide();
  const [focus, setFocus] = useState("");
  const edited = files.filter((file) => file.status !== "untracked");
  const fresh = files.length - edited.length;
  const added = edited.reduce((sum, file) => sum + file.added, 0);
  const removed = edited.reduce((sum, file) => sum + file.removed, 0);
  const outside = new Set(left);
  const open = edited.length > 0 || files.length > 300 ? edited : files;

  return (
    <>
      <Side title="Changes">
        <Tree
          paths={files.map((file) => file.path)}
          changes={files}
          selected={focus}
          open={open.map((file) => file.path)}
          showCounts
          onPick={(picked) => {
            if (outside.has(picked)) {
              router.push(filesHref.code(ws, picked));
            } else {
              setFocus(picked);
              closeSide();
            }
          }}
        />
      </Side>
      <div className="flex min-w-0 flex-1 flex-col">
        <FileBar>
          <span className="flex min-w-0 items-center gap-2 tabular-nums">
            {edited.length > 0 && (
              <span className="shrink-0">{many(edited.length, "file")}</span>
            )}
            {added > 0 && (
              <span className="text-ok">+{added.toLocaleString("en-US")}</span>
            )}
            {removed > 0 && (
              <span className="text-bad">
                −{removed.toLocaleString("en-US")}
              </span>
            )}
            {fresh > 0 && (
              <span className="shrink-0 text-muted-foreground">
                {many(fresh, "new file")}
              </span>
            )}
          </span>
          <span className="truncate text-muted-foreground max-md:hidden">
            {where}
            {ahead > 0 && ` · ${ahead} ahead`}
            {behind > 0 && ` · ${behind} behind`}
          </span>
          {files.length > 0 && (
            <Tools>
              <StylePills />
            </Tools>
          )}
        </FileBar>
        {files.length === 0 ? (
          <p className="m-auto p-6 text-sm text-muted-foreground">
            No changes.
          </p>
        ) : (
          <Review ws={ws} patch={patch} focus={focus} />
        )}
      </div>
    </>
  );
};
