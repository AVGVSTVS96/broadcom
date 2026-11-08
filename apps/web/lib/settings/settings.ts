import type { Config } from "@/lib/proxy/schema";

export interface Values {
  readonly strategy: string;
  readonly sessionAffinity: boolean;
  readonly forceModelPrefix: boolean;
  readonly resetCommand: string;
  readonly passthroughHeaders: boolean;
  readonly timezone: string;
  readonly deviceLabel: string;
  readonly githubActions: boolean;
}

export type Value = Values[keyof Values];

export const valuesOf = (config: Config): Values => ({
  deviceLabel: config.usage?.["device-label"] ?? "",
  forceModelPrefix: config.routing?.["force-model-prefix"] ?? false,
  githubActions: config.usage?.["github-actions"] ?? false,
  passthroughHeaders: config.requests?.["passthrough-headers"] ?? false,
  resetCommand: config.routing?.pool?.["reset-command"] ?? "",
  sessionAffinity: config.routing?.["session-affinity"] ?? false,
  strategy: config.routing?.strategy ?? "round-robin",
  timezone: config.usage?.timezone ?? "",
});

interface Base<K extends keyof Values> {
  readonly key: K;
  readonly path: readonly [string, ...string[]];
  readonly label: string;
  readonly about?: string;
}

type SwitchKey = {
  [K in keyof Values]: Values[K] extends boolean ? K : never;
}[keyof Values];

type TextKey = Exclude<keyof Values, SwitchKey>;

export type Field =
  | (Base<SwitchKey> & { readonly kind: "switch" })
  | (Base<TextKey> & { readonly kind: "text" })
  | (Base<TextKey> & {
      readonly kind: "choice";
      readonly options: readonly {
        readonly value: string;
        readonly label: string;
      }[];
    });

export const groups: readonly {
  readonly name: string;
  readonly fields: readonly Field[];
}[] = [
  {
    fields: [
      {
        about: "Any other strategy turns the account pool off.",
        key: "strategy",
        kind: "choice",
        label: "Strategy",
        options: [
          { label: "Quota pool", value: "quota" },
          { label: "Round robin", value: "round-robin" },
          { label: "Weighted round robin", value: "weighted-round-robin" },
          { label: "Fill first", value: "fill-first" },
        ],
        path: ["routing", "strategy"],
      },
      {
        key: "sessionAffinity",
        kind: "switch",
        label: "Keep each session on its account",
        path: ["routing", "session-affinity"],
      },
      {
        about: "Prefixed credentials only take models asked for by prefix.",
        key: "forceModelPrefix",
        kind: "switch",
        label: "Require model prefixes",
        path: ["routing", "force-model-prefix"],
      },
      {
        about: "Runs with one line about each reset the pool spends.",
        key: "resetCommand",
        kind: "text",
        label: "Command on reset",
        path: ["routing", "pool", "reset-command"],
      },
    ],
    name: "Routing",
  },
  {
    fields: [
      {
        key: "passthroughHeaders",
        kind: "switch",
        label: "Forward upstream response headers",
        path: ["requests", "passthrough-headers"],
      },
    ],
    name: "Requests",
  },
  {
    fields: [
      {
        about: "Usage days start at midnight here.",
        key: "timezone",
        kind: "text",
        label: "Time zone",
        path: ["usage", "timezone"],
      },
      {
        key: "deviceLabel",
        kind: "text",
        label: "This machine's name",
        path: ["usage", "device-label"],
      },
      {
        key: "githubActions",
        kind: "switch",
        label: "Claude usage from GitHub Actions",
        path: ["usage", "github-actions"],
      },
    ],
    name: "Usage",
  },
];

export const fields = groups.flatMap((group) => group.fields);

export interface Change {
  readonly path: string;
  readonly from: Value;
  readonly value: Value;
}

export const changesOf = (before: Values, after: Values): Change[] =>
  fields.flatMap((field) =>
    after[field.key] === before[field.key]
      ? []
      : [
          {
            from: before[field.key],
            path: field.path.join("/"),
            value: after[field.key],
          },
        ],
  );

export const conflicts = (changes: readonly Change[], current: Values) =>
  fields.filter((field) =>
    changes.some(
      (change) => change.path === field.path.join("/") && change.from !== current[field.key],
    ),
  );

interface Patch {
  [key: string]: Patch | Value;
}

export const patchOf = (changes: readonly Change[]) => {
  const patch: Patch = {};
  const branches = new Map<string, Patch>();

  for (const change of changes) {
    const keys = change.path.split("/");
    const last = keys.pop() ?? "";
    let at = patch;
    let prefix = "";

    for (const key of keys) {
      prefix = `${prefix}/${key}`;

      const branch = branches.get(prefix) ?? {};

      branches.set(prefix, branch);
      at[key] = branch;
      at = branch;
    }

    at[last] = change.value;
  }

  return patch;
};
