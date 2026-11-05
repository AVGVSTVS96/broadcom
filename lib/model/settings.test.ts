import { describe, expect, test } from "bun:test";

import { Schema } from "effect";

import { redact } from "@/lib/model/redact";
import { changesOf, conflicts, patchOf, valuesOf } from "@/lib/model/settings";
import { Config } from "@/lib/proxy/schema";

const config = {
  access: { "api-keys": ["sk-one", "sk-two"] },
  "api-keys": {
    claude: [
      { keys: [{ "api-key": "sk-ant", auth_index: "a1" }], name: "org" },
    ],
  },
  management: { "allow-remote": true, "secret-key": "hash" },
  routing: {
    pool: { "reset-command": "notify", "session-cutoff": 90 },
    "session-affinity": true,
    strategy: "quota",
  },
  usage: { timezone: "America/Los_Angeles" },
  workspace: { executor: { token: "t" } },
};

describe("settings", () => {
  test("reads what's set and falls back to the proxy's defaults", () => {
    const values = valuesOf(Schema.decodeUnknownSync(Config)(config));

    expect(values.strategy).toBe("quota");
    expect(values.sessionAffinity).toBe(true);
    expect(values.forceModelPrefix).toBe(false);
    expect(values.resetCommand).toBe("notify");
    expect(values.deviceLabel).toBe("");
  });

  test("changes carry only what changed, at its config path", () => {
    const before = valuesOf(Schema.decodeUnknownSync(Config)(config));

    expect(
      changesOf(before, { ...before, resetCommand: "", sessionAffinity: false })
    ).toEqual([
      { from: true, path: "routing/session-affinity", value: false },
      { from: "notify", path: "routing/pool/reset-command", value: "" },
    ]);
    expect(changesOf(before, before)).toEqual([]);
  });

  test("all changes go in one nested patch", () => {
    const before = valuesOf(Schema.decodeUnknownSync(Config)(config));

    const changes = changesOf(before, {
      ...before,
      resetCommand: "",
      sessionAffinity: false,
      timezone: "UTC",
    });

    expect(patchOf(changes)).toEqual({
      routing: { pool: { "reset-command": "" }, "session-affinity": false },
      usage: { timezone: "UTC" },
    });
  });

  test("a field changed elsewhere since the page loaded is a conflict", () => {
    const before = valuesOf(Schema.decodeUnknownSync(Config)(config));
    const changes = changesOf(before, { ...before, strategy: "fill-first" });

    expect(conflicts(changes, before)).toEqual([]);
    expect(
      conflicts(changes, { ...before, strategy: "round-robin" }).map(
        (field) => field.key
      )
    ).toEqual(["strategy"]);
  });

  test("hides keys, secrets and tokens and keeps the rest", () => {
    expect(redact(config)).toEqual({
      access: { "api-keys": ["••••", "••••"] },
      "api-keys": {
        claude: [
          { keys: [{ "api-key": "••••", auth_index: "a1" }], name: "org" },
        ],
      },
      management: { "allow-remote": true, "secret-key": "••••" },
      routing: config.routing,
      usage: config.usage,
      workspace: { executor: { token: "••••" } },
    });
  });
});
