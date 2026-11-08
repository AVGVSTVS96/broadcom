import "server-only";
import { existsSync, watch } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { Option, Schema } from "effect";

import { listRepos } from "@/lib/files/repos";
import type { Repo } from "@/lib/files/repos";
import { frontMatter, hookSummary } from "@/lib/plugins/setup";
import type { Hook, Setup, Source } from "@/lib/plugins/setup";

const home = homedir();

export const claudeDir = process.env.BROADCOM_CLAUDE_DIR ?? path.join(home, ".claude");

const hexDir = process.env.BROADCOM_HEX_DIR ?? path.join(home, "hex");

const readJson = async <S extends Schema.Top & { DecodingServices: never }>(
  file: string,
  schema: S,
): Promise<S["Type"] | null> => {
  const text = await readFile(/*turbopackIgnore: true*/ file, "utf-8").catch(() => null);

  return text === null
    ? null
    : Option.getOrNull(Schema.decodeUnknownOption(Schema.fromJsonString(schema))(text));
};

const Installed = Schema.Struct({
  plugins: Schema.Record(
    Schema.String,
    Schema.Array(
      Schema.Struct({
        installPath: Schema.optional(Schema.String),
        scope: Schema.optional(Schema.String),
        version: Schema.optional(Schema.String),
      }),
    ),
  ),
});

const Manifest = Schema.Struct({
  description: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
});

const Marketplaces = Schema.Record(
  Schema.String,
  Schema.Struct({ installLocation: Schema.optional(Schema.String) }),
);

const HookGroups = Schema.Record(
  Schema.String,
  Schema.Array(
    Schema.Struct({
      hooks: Schema.Array(Schema.Struct({ command: Schema.optional(Schema.String) })),
      matcher: Schema.optional(Schema.String),
    }),
  ),
);

const Settings = Schema.Struct({
  deniedMcpServers: Schema.optional(Schema.Array(Schema.Struct({ serverName: Schema.String }))),
  enabledMcpjsonServers: Schema.optional(Schema.Array(Schema.String)),
  enabledPlugins: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
  hooks: Schema.optional(HookGroups),
});

const McpConfig = Schema.Struct({
  mcpServers: Schema.optional(
    Schema.Record(
      Schema.String,
      Schema.Struct({
        command: Schema.optional(Schema.String),
        type: Schema.optional(Schema.String),
        url: Schema.optional(Schema.String),
      }),
    ),
  ),
});

const ownerOf = (repos: readonly Repo[], file: string): Source | null => {
  const [owner] = repos
    .filter((repo) => file.startsWith(`${repo.path}/`))
    .toSorted((a, b) => b.path.length - a.path.length);

  return owner === undefined ? null : { file: path.relative(owner.path, file), ws: owner.id };
};

const channelState = (dir: string) => {
  if (existsSync(/*turbopackIgnore: true*/ path.join(dir, "hub.sock"))) {
    return "connected" as const;
  }

  return existsSync(/*turbopackIgnore: true*/ dir) ? ("set up" as const) : ("installed" as const);
};

const tilde = (text: string) => text.replaceAll(home, "~");

const describeMod = async (dir: string) => {
  const manifests = await Promise.all(
    [".claude-plugin/plugin.json", "package.json"].map(
      async (name) => await readJson(path.join(/*turbopackIgnore: true*/ dir, name), Manifest),
    ),
  );

  const version = manifests.find((each) => each?.version !== undefined)?.version ?? null;

  const described = manifests.find((each) => each?.description !== undefined)?.description;

  if (described !== undefined) {
    return { description: described, version };
  }

  const readme = await readFile(
    /*turbopackIgnore: true*/ path.join(dir, "README.md"),
    "utf-8",
  ).catch(() => "");

  const line = readme
    .split("\n")
    .map((each) => each.trim())
    .find((each) => each !== "" && !each.startsWith("#"));

  return { description: line ?? "", version };
};

const listSkills = async (
  dir: string,
  scope: "hex" | "you",
  sourceOf: (file: string) => Source | null,
) => {
  const names = await readdir(/*turbopackIgnore: true*/ dir).catch(() => []);

  const skills = await Promise.all(
    names.map(async (name) => {
      const file = path.join(dir, name, "SKILL.md");

      const text = await readFile(/*turbopackIgnore: true*/ file, "utf-8").catch(() => null);

      const real = await realpath(/*turbopackIgnore: true*/ file).catch(() => file);

      return text === null
        ? []
        : [
            {
              description: frontMatter(text, "description"),
              name,
              scope,
              source: sourceOf(real),
            },
          ];
    }),
  );

  return skills.flat().toSorted((a, b) => a.name.localeCompare(b.name));
};

const listHooks = (
  groups: typeof HookGroups.Type | undefined,
  scope: "hex" | "you",
  source: Source | null,
): Hook[] =>
  Object.entries(groups ?? {})
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([event, list]) => {
      const commands = list.flatMap((group) => group.hooks.flatMap((hook) => hook.command ?? []));

      return {
        event,
        matchers: list.flatMap((group) => group.matcher ?? []),
        scope,
        source,
        summary: commands.map((command) => tilde(hookSummary(command))),
      };
    });

export const readSetup = async (): Promise<Setup> => {
  const repos = await listRepos();

  const sourceOf = (file: string) => ownerOf(repos, file);
  const userSettingsFile = path.join(claudeDir, "settings.json");
  const hexSettingsFile = path.join(hexDir, ".claude", "settings.json");

  const userConfig =
    claudeDir === path.join(home, ".claude")
      ? path.join(home, ".claude.json")
      : path.join(claudeDir, ".claude.json");

  const [installed, user, hex, markets, hexMcp, userMcp] = await Promise.all([
    readJson(path.join(claudeDir, "plugins", "installed_plugins.json"), Installed),
    readJson(userSettingsFile, Settings),
    readJson(hexSettingsFile, Settings),
    readJson(path.join(claudeDir, "plugins", "known_marketplaces.json"), Marketplaces),
    readJson(path.join(hexDir, ".mcp.json"), McpConfig),
    readJson(userConfig, McpConfig),
  ]);

  const channelsDir = markets?.hex?.installLocation ?? path.join(hexDir, ".hex", "channels");

  const entries = Object.entries(installed?.plugins ?? {}).toSorted(([a], [b]) =>
    a.localeCompare(b),
  );

  const channels = await Promise.all(
    entries
      .filter(([id]) => id.endsWith("@hex"))
      .map(async ([id, installs]) => {
        const [name = id] = id.split("@");
        const dir = path.join(channelsDir, name);

        const manifest = await readJson(path.join(dir, ".claude-plugin", "plugin.json"), Manifest);

        return {
          description: manifest?.description ?? "",
          id,
          name,
          source: existsSync(/*turbopackIgnore: true*/ dir) ? sourceOf(dir) : null,
          state: channelState(path.join(hexDir, "state", name)),
          version: manifest?.version ?? installs[0]?.version ?? null,
        };
      }),
  );

  const plugins = await Promise.all(
    entries
      .filter(([id]) => !id.endsWith("@hex"))
      .map(async ([id, installs]) => {
        const [name = id, market = ""] = id.split("@");
        const [first] = installs;

        const manifest =
          first?.installPath === undefined
            ? null
            : await readJson(
                path.join(first.installPath, ".claude-plugin", "plugin.json"),
                Manifest,
              );

        return {
          description: manifest?.description ?? "",
          enabled: user?.enabledPlugins?.[id] === true,
          id,
          market,
          name,
          version: first?.version ?? null,
        };
      }),
  );

  const modsDir = path.join(hexDir, ".hex", "mods");

  const modNames = await readdir(/*turbopackIgnore: true*/ modsDir, {
    withFileTypes: true,
  }).catch(() => []);

  const mods = await Promise.all(
    modNames
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const dir = path.join(modsDir, entry.name);

        return {
          name: entry.name,
          source: sourceOf(dir),
          ...(await describeMod(dir)),
        };
      }),
  );

  const denied = new Set(hex?.deniedMcpServers?.map((each) => each.serverName));
  const approved = new Set(hex?.enabledMcpjsonServers);

  const mcp = [
    ...Object.entries(hexMcp?.mcpServers ?? {}).map(([name, server]) => ({
      enabled: approved.has(name) && !denied.has(name),
      kind: server.type ?? "stdio",
      name,
      scope: "hex" as const,
      where: tilde(server.url ?? server.command ?? ""),
    })),
    ...Object.entries(userMcp?.mcpServers ?? {}).map(([name, server]) => ({
      enabled: !denied.has(name),
      kind: server.type ?? "stdio",
      name,
      scope: "you" as const,
      where: tilde(server.url ?? server.command ?? ""),
    })),
  ];

  const [hexSkills, userSkills] = await Promise.all([
    listSkills(path.join(hexDir, ".claude", "skills"), "hex", sourceOf),
    listSkills(path.join(claudeDir, "skills"), "you", sourceOf),
  ]);

  const userHooksSource = sourceOf(
    await realpath(/*turbopackIgnore: true*/ userSettingsFile).catch(() => userSettingsFile),
  );

  return {
    channels,
    hooks: [
      ...listHooks(hex?.hooks, "hex", sourceOf(hexSettingsFile)),
      ...listHooks(user?.hooks, "you", userHooksSource),
    ],
    mcp,
    mods,
    plugins,
    skills: [...hexSkills, ...userSkills],
  };
};

const only =
  (...names: string[]) =>
  (name: string) =>
    names.includes(name);

const any = () => true;

const targets = async (): Promise<[string, (name: string) => boolean][]> => {
  const stateDir = path.join(hexDir, "state");

  const channels = await readdir(/*turbopackIgnore: true*/ stateDir).catch(() => []);

  return [
    [claudeDir, only("settings.json")],
    [path.join(claudeDir, "plugins"), only("installed_plugins.json", "known_marketplaces.json")],
    [path.join(hexDir, ".claude"), only("settings.json")],
    [hexDir, only(".mcp.json")],
    [path.join(hexDir, ".claude", "skills"), any],
    [path.join(claudeDir, "skills"), any],
    [path.join(hexDir, ".hex", "mods"), any],
    ...channels.map((name): [string, (name: string) => boolean] => [
      path.join(stateDir, name),
      only("hub.sock"),
    ]),
  ];
};

export const watchSetup = async (changed: () => void) => {
  const dirs = await targets();

  const watchers = dirs.flatMap(([dir, wanted]) =>
    existsSync(/*turbopackIgnore: true*/ dir)
      ? [
          watch(/*turbopackIgnore: true*/ dir, (_, name) => {
            if (name !== null && wanted(name)) {
              changed();
            }
          }),
        ]
      : [],
  );

  return () => {
    for (const watcher of watchers) {
      watcher.close();
    }
  };
};
