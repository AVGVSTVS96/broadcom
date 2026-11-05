"use client";

import { parsePatchFiles } from "@pierre/diffs";
import type { CodeViewItem, FileDiffMetadata } from "@pierre/diffs";
import type {
  CodeViewReactOptions,
  FileDiffOptions,
  FileOptions,
} from "@pierre/diffs/react";
import { useSyncExternalStore } from "react";

export type DiffStyle = "unified" | "split";

const styleKey = "files.diffStyle";
const listeners = new Set<() => void>();

const readStyle = (): DiffStyle =>
  localStorage.getItem(styleKey) === "split" ? "split" : "unified";

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const choose = (next: DiffStyle) => {
  localStorage.setItem(styleKey, next);

  for (const listener of listeners) {
    listener();
  }
};

export const useDiffStyle = () => {
  const style = useSyncExternalStore(
    subscribe,
    readStyle,
    (): DiffStyle => "unified"
  );

  return [style, choose] as const;
};

const shared = {
  lineHoverHighlight: "both",
  theme: { dark: "pierre-dark", light: "pierre-light" },
  themeType: "system",
  unsafeCSS: `:host { --diffs-font-size: 12.5px; --diffs-line-height: 20px; }`,
} as const;

export const fileOptions: FileOptions<undefined, undefined> = {
  ...shared,
  disableFileHeader: true,
  overflow: "wrap",
};

export const diffOptions = (
  style: DiffStyle
): FileDiffOptions<undefined, undefined> => ({
  ...shared,
  diffStyle: style,
  disableFileHeader: true,
  lineDiffType: "word",
  overflow: style === "split" ? "scroll" : "wrap",
});

export const reviewOptions = (
  style: DiffStyle
): CodeViewReactOptions<undefined, undefined> => ({
  ...shared,
  diffStyle: style,
  hunkSeparators: "line-info",
  lineDiffType: "word",
  overflow: style === "split" ? "scroll" : "wrap",
  stickyHeaders: true,
});

const hash = (text: string) => {
  let value = 0;

  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + (text.codePointAt(index) ?? 0)) % 2_147_483_647;
  }

  return value;
};

export const patchItems = (patch: string): CodeViewItem<undefined>[] => {
  const version = hash(patch);

  return parsePatchFiles(patch, { cacheKeyPrefix: version.toString(36) })
    .flatMap((parsed) => parsed.files)
    .map((fileDiff: FileDiffMetadata) => ({
      fileDiff,
      id: fileDiff.name,
      type: "diff",
      version,
    }));
};
