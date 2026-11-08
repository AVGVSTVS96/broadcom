import { describe, expect, test } from "bun:test";

import {
  capPatch,
  countLines,
  dayGroups,
  folderEntries,
  newFilePatch,
  parseChanges,
  parseCommits,
  parseWorktrees,
  patchPath,
  resolveLink,
  splitPatch,
} from "@/lib/files/files";

describe("parseWorktrees", () => {
  test("reads branches, detached heads and skips prunable entries", () => {
    const porcelain = [
      "worktree /repo\0HEAD aaa\0branch refs/heads/main\0",
      "worktree /wt/one\0HEAD bbb\0branch refs/heads/feat/one\0",
      "worktree /wt/two\0HEAD ccc\0detached\0",
      "worktree /gone\0HEAD ddd\0branch refs/heads/old\0prunable gitdir file points to non-existent location\0",
    ].join("\0");

    expect(parseWorktrees(porcelain)).toEqual([
      { branch: "main", head: "aaa", path: "/repo" },
      { branch: "feat/one", head: "bbb", path: "/wt/one" },
      { branch: null, head: "ccc", path: "/wt/two" },
    ]);
  });
});

describe("parseCommits", () => {
  test("reads subject, body, author, time and signature", () => {
    const signed = [
      "commit 1234567890abcdef",
      "tree t",
      "author Ada Lovelace <ada@example.com> 1700000000 -0800",
      "gpgsig -----BEGIN SSH SIGNATURE-----",
      " abc",
      "",
      "    feat: one",
      "    ",
      "    The body.",
      "",
    ].join("\n");

    const plain = "commit fedcba\nauthor Bo <b@x> 1700000100 +0000\n\n    fix: two\n";

    expect(parseCommits(`${signed}\0${plain}`)).toEqual([
      {
        at: 1_700_000_000_000,
        author: "Ada Lovelace",
        body: "The body.",
        sha: "1234567890abcdef",
        short: "1234567",
        signed: true,
        subject: "feat: one",
      },
      {
        at: 1_700_000_100_000,
        author: "Bo",
        body: "",
        sha: "fedcba",
        short: "fedcba",
        signed: false,
        subject: "fix: two",
      },
    ]);
  });
});

test("parseChanges pairs line counts with statuses, binaries counting zero", () => {
  const numstat = "3\t1\tsrc/a.ts\0-\t-\tlogo.png\u00000\t9\told.md\0";
  const names = "M\0src/a.ts\0A\0logo.png\0D\0old.md\0";

  expect(parseChanges(numstat, names)).toEqual([
    { added: 3, path: "src/a.ts", removed: 1, status: "modified" },
    { added: 0, path: "logo.png", removed: 0, status: "added" },
    { added: 0, path: "old.md", removed: 9, status: "deleted" },
  ]);
});

test("countLines counts a last line without a newline", () => {
  expect([countLines(""), countLines("a\n"), countLines("a\nb")]).toEqual([0, 1, 2]);
});

test("newFilePatch writes an untracked file as git would add it", () => {
  expect(newFilePatch("x.txt", "one\ntwo\n")).toBe(
    "diff --git a/x.txt b/x.txt\nnew file mode 100644\n--- /dev/null\n+++ b/x.txt\n@@ -0,0 +1,2 @@\n+one\n+two\n",
  );
  expect(newFilePatch("y", "solo")).toBe(
    "diff --git a/y b/y\nnew file mode 100644\n--- /dev/null\n+++ b/y\n@@ -0,0 +1 @@\n+solo\n\\ No newline at end of file\n",
  );
});

test("splitPatch and capPatch keep whole files and name the rest", () => {
  const a = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-x\n+y\n";

  const gone =
    "diff --git a/gone b/gone\ndeleted file mode 100644\n--- a/gone\n+++ /dev/null\n@@ -1 +0,0 @@\n-z\n";

  const files = splitPatch(a + gone);

  expect(files).toEqual([a, gone]);
  expect(patchPath(gone)).toBe("gone");
  expect(capPatch(files, a.length)).toEqual({ omitted: ["gone"], patch: a });
});

test("folderEntries lists one level with folder sizes", () => {
  const paths = ["src/a.ts", "src/lib/b.ts", "src/lib/c.ts", "README.md"];

  expect(folderEntries(paths, "src")).toEqual({
    dirs: [["lib", 2]],
    files: ["a.ts"],
  });
  expect(folderEntries(paths, "")).toEqual({
    dirs: [["src", 3]],
    files: ["README.md"],
  });
});

test("resolveLink stays inside the repo", () => {
  expect(resolveLink("docs/guide.md", "../README.md#top")).toBe("README.md");
  expect(resolveLink("docs/guide.md", "img/a.png")).toBe("docs/img/a.png");
  expect(resolveLink("docs/guide.md", "/AGENTS.md")).toBe("AGENTS.md");
  expect(resolveLink("a.md", "../../etc/passwd")).toBeNull();
  expect(resolveLink("a.md", "https://example.com")).toBeNull();
  expect(resolveLink("a.md", "#section")).toBeNull();
});

const commitAt = (at: Date) => ({
  at: at.getTime(),
  author: "",
  body: "",
  sha: String(at.getTime()),
  short: "",
  signed: true,
  subject: "",
});

test("dayGroups names today and yesterday by the local clock", () => {
  const now = new Date(2026, 10, 5, 10);

  const groups = dayGroups(
    [
      commitAt(new Date(2026, 10, 5, 9)),
      commitAt(new Date(2026, 10, 5, 0, 5)),
      commitAt(new Date(2026, 10, 4, 23)),
      commitAt(new Date(2026, 10, 1, 12)),
    ],
    now,
  );

  expect(groups.map((group) => [group.day, group.commits.length])).toEqual([
    ["Today", 2],
    ["Yesterday", 1],
    ["Sun, Nov 1", 1],
  ]);
});
