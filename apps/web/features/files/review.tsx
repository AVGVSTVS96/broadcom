"use client";

import type { FileDiffContentsLoader } from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useEffect, useMemo, useRef } from "react";

import { loadSides } from "@/features/files/actions";
import { patchItems, reviewOptions, useDiffStyle } from "@/features/files/code";

export const Review = ({
  ws,
  sha = "",
  patch,
  focus = "",
}: {
  ws: string;
  sha?: string;
  patch: string;
  focus?: string;
}) => {
  const [style] = useDiffStyle();
  const view = useRef<CodeViewHandle<undefined, undefined>>(null);
  const items = useMemo(() => patchItems(patch), [patch]);

  const options = useMemo(() => {
    const loadDiffFiles: FileDiffContentsLoader = async (fileDiff) => {
      const sides = await loadSides(ws, fileDiff.name, sha);

      return {
        newFile: { contents: sides?.after ?? "", name: fileDiff.name },
        oldFile: { contents: sides?.before ?? "", name: fileDiff.name },
      };
    };

    return { ...reviewOptions(style), loadDiffFiles };
  }, [style, ws, sha]);

  useEffect(() => {
    if (focus !== "") {
      view.current?.scrollTo({ behavior: "smooth", id: focus, type: "item" });
    }
  }, [focus]);

  return (
    <CodeView ref={view} className="min-h-0 flex-1 overflow-auto" items={items} options={options} />
  );
};
