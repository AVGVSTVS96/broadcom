import "server-only";
import { Option, Schema } from "effect";

import { present } from "@/lib/live/event";
import type { LiveEvent } from "@/lib/live/event";
import { Account, LiveSession, Pool } from "@/lib/proxy/schema";
import type {
  Account as AccountType,
  LiveSession as LiveSessionType,
  Pool as PoolType,
} from "@/lib/proxy/schema";

const Raw = Schema.Union([
  Schema.Struct({
    live: Schema.Record(Schema.String, Schema.Json),
    type: Schema.Literal("snapshot"),
  }),
  Schema.Struct({
    live: Schema.Record(Schema.String, Schema.Json),
    type: Schema.Literal("patch"),
  }),
  Schema.Struct({
    tags: Schema.Array(Schema.String),
    type: Schema.Literal("stale"),
  }),
]);

const decodeRaw = Schema.decodeUnknownOption(Schema.fromJsonString(Raw));
const decodeAccount = Schema.decodeUnknownOption(Account);
const decodeSession = Schema.decodeUnknownOption(LiveSession);
const decodePool = Schema.decodeUnknownOption(Pool);

const keep = <A>(
  into: Record<string, A | null>,
  id: string,
  value: Schema.Json,
  decode: (input: Schema.Json) => Option.Option<A>
) => {
  if (value === null) {
    into[id] = null;

    return;
  }

  const decoded = decode(value);

  if (Option.isSome(decoded)) {
    into[id] = decoded.value;
  }
};

const split = (entries: Readonly<Record<string, Schema.Json>>) => {
  const accounts: Record<string, AccountType | null> = {};
  const sessions: Record<string, LiveSessionType | null> = {};
  let pool: PoolType | null = null;

  for (const [key, value] of Object.entries(entries)) {
    if (key === "pool") {
      pool = Option.getOrNull(decodePool(value));
    } else if (key.startsWith("a:")) {
      keep(accounts, key.slice(2), value, decodeAccount);
    } else if (key.startsWith("s:")) {
      keep(sessions, key.slice(2), value, decodeSession);
    }
  }

  return { accounts, pool, sessions };
};

export const decodeLiveEvent = (data: string): LiveEvent | null => {
  const raw = Option.getOrNull(decodeRaw(data));

  if (raw === null) {
    return null;
  }

  if (raw.type === "stale") {
    return { tags: raw.tags, type: "stale" };
  }

  const { accounts, sessions, pool } = split(raw.live);

  if (raw.type === "patch") {
    return { change: { accounts, pool, sessions }, type: "patch" };
  }

  return {
    live: { accounts: present(accounts), pool, sessions: present(sessions) },
    type: "snapshot",
  };
};
