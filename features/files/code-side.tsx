"use client";

import { usePathname, useRouter } from "next/navigation";

import { Side } from "@/features/files/bench";
import { Tree } from "@/features/files/tree";
import { filesHref, parseFilesPath } from "@/features/files/urls";
import type { Change } from "@/lib/model/files";

export const CodeSide = ({
  ws,
  paths,
  changes,
}: {
  ws: string;
  paths: readonly string[];
  changes: readonly Change[];
}) => {
  const router = useRouter();
  const { file } = parseFilesPath(usePathname());

  return (
    <Side title="Files">
      <Tree
        paths={paths}
        changes={changes}
        selected={file}
        onPick={(picked) => {
          router.push(filesHref.code(ws, picked));
        }}
      />
    </Side>
  );
};
