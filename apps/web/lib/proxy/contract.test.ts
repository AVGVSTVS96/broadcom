import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

import { Schema } from "effect";

import { decodeLiveEvent } from "@/lib/live/decode";
import type { LiveEvent } from "@/lib/live/event";
import { Credits, LimitUsage, UsageView } from "@/lib/proxy/schema";

const examples = new URL("../../../../crates/usage/api/examples/", import.meta.url);

const read = (name: string) => readFileSync(new URL(name, examples), "utf-8");

const Sent = Schema.fromJsonString(
  Schema.Struct({ live: Schema.Record(Schema.String, Schema.Json) }),
);

const sessionsSent = (name: string) =>
  Object.keys(Schema.decodeUnknownSync(Sent)(read(name)).live).filter((key) => key.startsWith("s:"))
    .length;

const sessionsKept = (event: LiveEvent | null) => {
  if (event === null || event.type === "stale") {
    return 0;
  }

  return Object.keys(event.type === "snapshot" ? event.live.sessions : event.change.sessions)
    .length;
};

const decodes = (schema: Schema.Codec<unknown>, name: string) => {
  expect(() => Schema.decodeUnknownSync(Schema.fromJsonString(schema))(read(name))).not.toThrow();
};

const checked = [
  "credits.json",
  "usage.json",
  "events-snapshot.json",
  "events-patch.json",
  "events-stale.json",
];

const neverRead = ["batch.json", "sessions.json"];

describe("the usage service's examples decode with the dashboard's schemas", () => {
  test("/deck/credits", () => {
    decodes(Credits, "credits.json");
  });

  test("/deck/usage", () => {
    decodes(UsageView, "usage.json");
    decodes(LimitUsage, "usage.json");
  });

  test.each(["events-snapshot.json", "events-patch.json"])("/deck/events %s", (name) => {
    expect(sessionsKept(decodeLiveEvent(read(name)))).toBe(sessionsSent(name));
  });

  test("/deck/events stale", () => {
    expect(decodeLiveEvent(read("events-stale.json"))?.type).toBe("stale");
  });

  test("every example is checked here or is one the dashboard never reads", () => {
    expect(readdirSync(examples).toSorted()).toEqual([...checked, ...neverRead].toSorted());
  });
});
