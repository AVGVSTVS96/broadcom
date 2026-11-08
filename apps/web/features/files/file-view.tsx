"use client";

import { File, MultiFileDiff, Virtualizer } from "@pierre/diffs/react";
import { useMemo } from "react";

import { diffOptions, fileOptions, useDiffStyle } from "@/features/files/code";

export const FileView = ({
  name,
  text,
  original,
  diff,
}: {
  name: string;
  text: string;
  original: string | null;
  diff: boolean;
}) => {
  const [style] = useDiffStyle();
  const file = useMemo(() => ({ contents: text, name }), [name, text]);

  const before = useMemo(
    () => (original === null ? null : { contents: original, name }),
    [name, original],
  );

  return (
    <Virtualizer className="min-h-0 flex-1 overflow-auto">
      {diff && before !== null ? (
        <MultiFileDiff oldFile={before} newFile={file} options={diffOptions(style)} />
      ) : (
        <File file={file} options={fileOptions} />
      )}
    </Virtualizer>
  );
};
