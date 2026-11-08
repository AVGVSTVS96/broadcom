import "server-only";
import { existsSync, watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import path from "node:path";

import { listFiles } from "@/lib/files/read";
import type { Workspace } from "@/lib/files/repos";
import { git } from "@/lib/files/run";

const gitState = new Set(["HEAD", "index", "packed-refs"]);

export const watchWorkspace = async (ws: Workspace, changed: () => void) => {
  const [files, dirs] = await Promise.all([
    listFiles(ws),
    git(ws.path, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"),
  ]);

  const [gitDir = "", commonDir = ""] = dirs.trim().split("\n");

  const folders = new Set([
    ws.path,
    ...files.map((file) => path.join(ws.path, path.dirname(file))),
  ]);

  const watchers: FSWatcher[] = [];

  const follow = (dir: string, wanted: (name: string) => boolean, recursive = false) => {
    if (existsSync(/*turbopackIgnore: true*/ dir)) {
      watchers.push(
        watch(/*turbopackIgnore: true*/ dir, { recursive }, (_, name) => {
          if (name !== null && !name.endsWith(".lock") && wanted(name)) {
            changed();
          }
        }),
      );
    }
  };

  for (const folder of folders) {
    follow(folder, (name) => name !== ".git");
  }

  follow(gitDir, (name) => gitState.has(name));
  follow(commonDir, (name) => gitState.has(name));
  follow(path.join(commonDir, "refs/heads"), () => true, true);

  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
};
