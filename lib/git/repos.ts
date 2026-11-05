import "server-only";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { Schema } from "effect";
import { cache } from "react";

import { git, tryGit } from "@/lib/git/run";
import { parseWorktrees, slug } from "@/lib/model/files";

const configFile =
  process.env.BROADCOM_REPOS ??
  path.join(homedir(), ".config/broadcom/repos.json");

const Config = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ name: Schema.String, path: Schema.String }))
);

export interface Repo {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly repo: Repo;
  readonly path: string;
  readonly branch: string | null;
  readonly base: string | null;
  readonly at: number;
  readonly live: boolean;
}

const expand = (at: string) =>
  path.resolve(at.replace(/^~(?=$|\/)/u, homedir()));

export const listRepos = cache(async (): Promise<Repo[]> => {
  const text = await readFile(
    /*turbopackIgnore: true*/ configFile,
    "utf-8"
  ).catch(() => "[]");

  return Schema.decodeUnknownSync(Config)(text)
    .map((repo) => ({
      id: slug(repo.name),
      name: repo.name,
      path: expand(repo.path),
    }))
    .filter((repo) => existsSync(path.join(repo.path, ".git")));
});

const adminNames = async (repo: Repo) => {
  const out = await git(
    repo.path,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  );

  const common = out.trim();

  const dir = path.join(common, "worktrees");
  const names = await readdir(dir).catch(() => []);

  const pairs = await Promise.all(
    names.map(async (name) => {
      const gitdir = await readFile(
        path.join(dir, name, "gitdir"),
        "utf-8"
      ).catch(() => "");

      return [path.dirname(gitdir.trim()), name] as const;
    })
  );

  return new Map(pairs);
};

const commitTimes = async (repo: Repo, heads: readonly string[]) => {
  const out =
    (await tryGit(repo.path, "show", "-s", "--format=%H %ct", ...heads)) ?? "";

  return new Map(
    out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha = "", seconds = "0"] = line.split(" ");

        return [sha, Number(seconds) * 1000] as const;
      })
  );
};

export const listWorkspaces = cache(
  async (repo: Repo): Promise<Workspace[]> => {
    const [porcelain, names] = await Promise.all([
      git(repo.path, "worktree", "list", "--porcelain", "-z"),
      adminNames(repo),
    ]);

    const [main, ...linked] = parseWorktrees(porcelain);

    const heads = [
      ...new Set([main, ...linked].flatMap((wt) => wt?.head ?? [])),
    ];

    const times = await commitTimes(repo, heads);
    const liveBranch = main?.branch ?? null;

    const live: Workspace = {
      at: times.get(main?.head ?? "") ?? 0,
      base: null,
      branch: liveBranch,
      id: repo.id,
      live: true,
      name: liveBranch ?? "detached",
      path: repo.path,
      repo,
    };

    const trees = linked.flatMap((wt) => {
      const name = names.get(wt.path);

      return name === undefined || !existsSync(wt.path)
        ? []
        : [
            {
              at: times.get(wt.head) ?? 0,
              base: liveBranch,
              branch: wt.branch,
              id: `${repo.id}~${name}`,
              live: false,
              name: wt.branch ?? path.basename(wt.path),
              path: wt.path,
              repo,
            },
          ];
    });

    return [live, ...trees.toSorted((a, b) => b.at - a.at)];
  }
);

export const findWorkspace = cache(async (id: string) => {
  const [repoId] = id.split("~");
  const repos = await listRepos();
  const repo = repos.find((each) => each.id === repoId);

  if (repo === undefined) {
    return null;
  }

  const workspaces = await listWorkspaces(repo);

  return workspaces.find((ws) => ws.id === id) ?? null;
});
