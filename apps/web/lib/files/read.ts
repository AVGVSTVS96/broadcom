import "server-only";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";

import { cache } from "react";

import {
  capPatch,
  fields,
  isBinary,
  newFilePatch,
  parseChanges,
  parseCommit,
  parseCommits,
  splitPatch,
} from "@/lib/files/files";
import type { Change, Commit } from "@/lib/files/files";
import type { Workspace } from "@/lib/files/repos";
import { git, gitBytes, tryGit } from "@/lib/files/run";

const maxFile = 2_000_000;
const maxPatch = 4_000_000;
export const newFilesShown = 24;

const diffFlags = [
  "--no-color",
  "--no-ext-diff",
  "--no-textconv",
  "--no-renames",
  "--ignore-submodules",
];

export const inside = (ws: Workspace, file: string) => {
  const full = path.resolve(ws.path, file);
  const rel = path.relative(ws.path, full);

  if (
    file === "" ||
    rel.startsWith("..") ||
    path.isAbsolute(rel) ||
    rel.split(path.sep).includes(".git")
  ) {
    return null;
  }

  return full;
};

const readText = async (ws: Workspace, file: string) => {
  const full = inside(ws, file);

  const data =
    full === null ? null : await readFile(/*turbopackIgnore: true*/ full).catch(() => null);

  return data === null || data.length > maxFile || isBinary(data) ? "" : data.toString("utf-8");
};

const fork = cache(async (ws: Workspace) => {
  if (ws.base === null) {
    return "HEAD";
  }

  const base = await tryGit(ws.path, "merge-base", "HEAD", ws.base);

  return base?.trim() ?? "HEAD";
});

const untracked = cache(async (ws: Workspace) =>
  fields(await git(ws.path, "ls-files", "-z", "--others", "--exclude-standard")).filter(
    (file) => !file.endsWith("/"),
  ),
);

export const listFiles = cache(async (ws: Workspace) => {
  const [tracked, fresh] = await Promise.all([
    git(ws.path, "ls-files", "-z", "--stage"),
    untracked(ws),
  ]);

  const paths = fields(tracked).flatMap((entry) => {
    const tab = entry.indexOf("\t");

    return entry.startsWith("160000") ? [] : [entry.slice(tab + 1)];
  });

  return [...new Set([...paths, ...fresh])].toSorted();
});

export interface Changes {
  readonly files: readonly Change[];
  readonly fresh: readonly string[];
  readonly ahead: number;
  readonly behind: number;
}

export const readChanges = cache(async (ws: Workspace): Promise<Changes> => {
  const from = await fork(ws);

  const [numstat, names, fresh, distance] = await Promise.all([
    git(ws.path, "diff", "-z", ...diffFlags, "--numstat", from),
    git(ws.path, "diff", "-z", ...diffFlags, "--name-status", from),
    untracked(ws),
    ws.base === null
      ? null
      : tryGit(ws.path, "rev-list", "--left-right", "--count", `${ws.base}...HEAD`),
  ]);

  const [behind = 0, ahead = 0] = (distance ?? "").split(/\s+/u).map(Number);

  return { ahead, behind, files: parseChanges(numstat, names), fresh };
});

export const readDiff = async (ws: Workspace) => {
  const from = await fork(ws);

  const [tracked, fresh] = await Promise.all([
    git(ws.path, "diff", ...diffFlags, "--src-prefix=a/", "--dst-prefix=b/", from, "--"),
    untracked(ws),
  ]);

  const shown = fresh.length <= newFilesShown ? fresh : [];

  const added = await Promise.all(
    shown.map(async (file) => {
      const text = await readText(ws, file);

      return text === "" ? [] : [newFilePatch(file, text)];
    }),
  );

  return capPatch([...splitPatch(tracked), ...added.flat()], maxPatch);
};

export type FileBody =
  | { readonly kind: "missing" }
  | { readonly kind: "folder" }
  | { readonly kind: "binary"; readonly size: number }
  | { readonly kind: "large"; readonly size: number }
  | {
      readonly kind: "text";
      readonly size: number;
      readonly text: string;
      readonly original: string | null;
      readonly link: boolean;
    };

const original = async (ws: Workspace, file: string) => {
  const blob = await gitBytes(ws.path, "cat-file", "blob", `${await fork(ws)}:${file}`).catch(
    () => null,
  );

  return blob === null || blob.length > maxFile || isBinary(blob) ? null : blob.toString("utf-8");
};

export const readBody = async (ws: Workspace, file: string): Promise<FileBody> => {
  const full = inside(ws, file);

  const stat = full === null ? null : await lstat(/*turbopackIgnore: true*/ full).catch(() => null);

  if (full === null || stat === null) {
    return { kind: "missing" };
  }

  if (stat.isDirectory()) {
    return { kind: "folder" };
  }

  if (stat.isSymbolicLink()) {
    const text = await readlink(/*turbopackIgnore: true*/ full);

    return {
      kind: "text",
      link: true,
      original: await original(ws, file),
      size: text.length,
      text,
    };
  }

  if (stat.size > maxFile) {
    return { kind: "large", size: stat.size };
  }

  const data = await readFile(/*turbopackIgnore: true*/ full);

  return isBinary(data)
    ? { kind: "binary", size: stat.size }
    : {
        kind: "text",
        link: false,
        original: await original(ws, file),
        size: stat.size,
        text: data.toString("utf-8"),
      };
};

export const lastCommit = async (ws: Workspace, file: string) => {
  const out = await tryGit(ws.path, "log", "-1", "--pretty=raw", "--no-color", "HEAD", "--", file);

  return out === null ? null : parseCommit(out);
};

export const listCommits = async (ws: Workspace, file: string | null) =>
  parseCommits(
    (await tryGit(
      ws.path,
      "log",
      "-z",
      "--pretty=raw",
      "--no-color",
      "-n",
      "150",
      "HEAD",
      "--",
      ...(file === null ? [] : [file]),
    )) ?? "",
  );

export interface CommitDetail {
  readonly commit: Commit;
  readonly patch: string;
  readonly omitted: readonly string[];
}

export const readCommit = async (ws: Workspace, sha: string): Promise<CommitDetail | null> => {
  if (!/^[0-9a-f]{4,64}$/iu.test(sha)) {
    return null;
  }

  const head = await tryGit(
    ws.path,
    "log",
    "-1",
    "--pretty=raw",
    "--no-color",
    `${sha}^{commit}`,
    "--",
  );

  const commit = head === null ? null : parseCommit(head);

  if (commit === null) {
    return null;
  }

  const patch = await git(
    ws.path,
    "show",
    "--format=",
    "--patch",
    ...diffFlags,
    "--diff-merges=first-parent",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    commit.sha,
    "--",
  );

  return { commit, ...capPatch(splitPatch(patch), maxPatch) };
};

const pictures = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export const pictureType = (file: string) => pictures.get(path.extname(file).toLowerCase()) ?? null;

export const readPicture = async (ws: Workspace, file: string) => {
  const type = pictureType(file);
  const full = inside(ws, file);

  const stat = full === null ? null : await lstat(/*turbopackIgnore: true*/ full).catch(() => null);

  return type === null ||
    full === null ||
    stat === null ||
    !stat.isFile() ||
    stat.size > 5 * maxFile
    ? null
    : { data: await readFile(/*turbopackIgnore: true*/ full), type };
};

const blobText = async (ws: Workspace, spec: string) => {
  const blob = await gitBytes(ws.path, "cat-file", "blob", spec).catch(() => null);

  return blob === null || isBinary(blob) ? "" : blob.toString("utf-8");
};

export const readSides = async (ws: Workspace, file: string, sha: string) => {
  if (sha === "") {
    return {
      after: await readText(ws, file),
      before: (await original(ws, file)) ?? "",
    };
  }

  if (!/^[0-9a-f]{4,64}$/iu.test(sha)) {
    return null;
  }

  const [before, after] = await Promise.all([
    blobText(ws, `${sha}^:${file}`),
    blobText(ws, `${sha}:${file}`),
  ]);

  return { after, before };
};
