export interface Commit {
  readonly sha: string;
  readonly short: string;
  readonly subject: string;
  readonly body: string;
  readonly author: string;
  readonly at: number;
  readonly signed: boolean;
}

export type ChangeStatus = "added" | "deleted" | "modified" | "untracked";

export interface Change {
  readonly path: string;
  readonly status: ChangeStatus;
  readonly added: number;
  readonly removed: number;
}

export interface Worktree {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
}

export const fields = (out: string) => out.split("\0").filter(Boolean);

const splitField = (line: string): [string, string] => {
  const space = line.indexOf(" ");

  return space === -1 ? [line, ""] : [line.slice(0, space), line.slice(space + 1)];
};

export const parseWorktrees = (porcelain: string): Worktree[] =>
  porcelain
    .split("\0\0")
    .map((block) => new Map(fields(block).map(splitField)))
    .filter((entry) => entry.has("worktree") && !entry.has("prunable"))
    .map((entry) => ({
      branch: entry.get("branch")?.replace(/^refs\/heads\//u, "") ?? null,
      head: entry.get("HEAD") ?? "",
      path: entry.get("worktree") ?? "",
    }));

export const parseCommit = (record: string): Commit | null => {
  const text = record.replace(/^\n+/u, "");
  const split = text.indexOf("\n\n");
  const header = split === -1 ? text : text.slice(0, split);
  const message = split === -1 ? "" : text.slice(split + 2);
  let sha = "";
  let author = "";
  let at = 0;
  let signed = false;

  for (const line of header.split("\n")) {
    const [key, value] = splitField(line);

    if (key === "commit") {
      [sha = ""] = value.split(" ");
    } else if (key === "author") {
      const open = value.lastIndexOf(" <");
      const close = value.lastIndexOf("> ");

      author = open === -1 ? value : value.slice(0, open);
      at = close === -1 ? 0 : Number(value.slice(close + 2).split(" ")[0]) * 1000;
    } else if (key === "gpgsig" || key === "gpgsig-sha256") {
      signed = true;
    }
  }

  if (sha === "") {
    return null;
  }

  const lines = message
    .trimEnd()
    .split("\n")
    .map((line) => line.replace(/^ {4}/u, ""));

  const [subject = "", ...body] = lines;

  return {
    at,
    author,
    body: body.join("\n").trim(),
    sha,
    short: sha.slice(0, 7),
    signed,
    subject,
  };
};

export const parseCommits = (log: string) =>
  fields(log).flatMap((record) => parseCommit(record) ?? []);

const statusNames = new Map<string, ChangeStatus>([
  ["A", "added"],
  ["D", "deleted"],
]);

export const parseChanges = (numstat: string, nameStatus: string): Change[] => {
  const statuses = new Map<string, ChangeStatus>();
  const names = fields(nameStatus);

  for (let index = 0; index + 1 < names.length; index += 2) {
    statuses.set(names[index + 1] ?? "", statusNames.get(names[index] ?? "") ?? "modified");
  }

  return fields(numstat).flatMap((line) => {
    const [added = "", removed = "", path] = line.split("\t");

    return path === undefined
      ? []
      : [
          {
            added: Number(added) || 0,
            path,
            removed: Number(removed) || 0,
            status: statuses.get(path) ?? "modified",
          },
        ];
  });
};

export const isBinary = (data: Uint8Array) => data.subarray(0, 8000).includes(0);

export const countLines = (text: string) =>
  text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

export const newFilePatch = (path: string, text: string) => {
  const head = `diff --git a/${path} b/${path}\nnew file mode 100644\n`;

  if (text === "") {
    return head;
  }

  const lines = text.replace(/\n$/u, "").split("\n");
  const range = lines.length === 1 ? "" : `,${lines.length}`;
  const end = text.endsWith("\n") ? "" : "\\ No newline at end of file\n";

  return `${head}--- /dev/null\n+++ b/${path}\n@@ -0,0 +1${range} @@\n${lines.map((line) => `+${line}\n`).join("")}${end}`;
};

export const splitPatch = (patch: string) =>
  patch.split(/^(?=diff --git )/mu).filter((file) => file.startsWith("diff --git "));

export const patchPath = (file: string) => {
  const named = /^\+\+\+ b\/(?<path>.*)$/mu.exec(file) ?? /^--- a\/(?<path>.*)$/mu.exec(file);

  const header = file.slice(0, file.indexOf("\n"));

  return named?.groups?.path ?? header.slice(header.lastIndexOf(" b/") + 3);
};

export const capPatch = (files: readonly string[], limit: number) => {
  let size = 0;
  const kept: string[] = [];
  const omitted: string[] = [];

  for (const file of files) {
    if (size + file.length > limit) {
      omitted.push(patchPath(file));
    } else {
      size += file.length;
      kept.push(file);
    }
  }

  return { omitted, patch: kept.join("") };
};

export const folderEntries = (paths: readonly string[], folder: string) => {
  const dirs = new Map<string, number>();
  const files: string[] = [];
  const prefix = folder === "" ? "" : `${folder}/`;

  for (const path of paths) {
    if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf("/");

      if (slash === -1) {
        files.push(rest);
      } else {
        const name = rest.slice(0, slash);

        dirs.set(name, (dirs.get(name) ?? 0) + 1);
      }
    }
  }

  return {
    dirs: [...dirs].toSorted(([a], [b]) => a.localeCompare(b)),
    files: files.toSorted((a, b) => a.localeCompare(b)),
  };
};

const external = /^[a-z][a-z0-9+.-]*:|^\/\//iu;

export const resolveLink = (from: string, href: string) => {
  if (href === "" || href.startsWith("#") || external.test(href)) {
    return null;
  }

  const [target = ""] = href.split(/[?#]/u);
  const parts = href.startsWith("/") ? [] : from.split("/").slice(0, -1);

  for (const part of decodeURIComponent(target).split("/")) {
    if (part === "..") {
      if (parts.length === 0) {
        return null;
      }

      parts.pop();
    } else if (part !== "" && part !== ".") {
      parts.push(part);
    }
  }

  return parts.length === 0 ? null : parts.join("/");
};

export const dayGroups = (commits: readonly Commit[], now: Date) => {
  const today = new Date(now);

  today.setHours(0, 0, 0, 0);
  const yesterday = today.getTime() - 86_400_000;

  const name = (at: number) => {
    if (at >= today.getTime()) {
      return "Today";
    }

    if (at >= yesterday) {
      return "Yesterday";
    }

    return new Date(at).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      weekday: "short",
      year: new Date(at).getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
  };

  const groups: { day: string; commits: Commit[] }[] = [];

  for (const commit of commits) {
    const day = name(commit.at);
    const last = groups.at(-1);

    if (last?.day === day) {
      last.commits.push(commit);
    } else {
      groups.push({ commits: [commit], day });
    }
  }

  return groups;
};

export const slug = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
