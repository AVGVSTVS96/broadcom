import { Schema } from "effect";

const Millis = Schema.Number;
const NullableNumber = Schema.NullOr(Schema.Number);

export const LimitWindow = Schema.Struct({
  cutoff: Schema.Number,
  elapsed: NullableNumber,
  resetsAt: Schema.NullOr(Millis),
  sampledAt: Schema.NullOr(Millis),
  used: NullableNumber,
});

export type LimitWindow = typeof LimitWindow.Type;

export const Standing = Schema.Literals([
  "next",
  "open",
  "tight",
  "limited",
  "signed-out",
]);

export type Standing = typeof Standing.Type;

export const Account = Schema.Struct({
  atLimit: Schema.NullOr(
    Schema.Struct({ available: Schema.Boolean, nextAt: Schema.NullOr(Millis) })
  ),
  cloud: Schema.NullOr(
    Schema.Struct({
      expiresAt: Schema.NullOr(Millis),
      limit: NullableNumber,
      remaining: NullableNumber,
      sampledAt: Millis,
      used: NullableNumber,
    })
  ),
  fiveHour: LimitWindow,
  heldResets: Schema.Array(
    Schema.Struct({
      expiresAt: Schema.NullOr(Millis),
      kind: Schema.String,
      left: Schema.Number,
    })
  ),
  id: Schema.String,
  idle: Schema.Number,
  label: Schema.String,
  plan: Schema.String,
  rank: NullableNumber,
  reasons: Schema.Array(Schema.String),
  resetPlan: Schema.optionalKey(Schema.String),
  resetsSpent: Schema.optionalKey(Schema.Array(Millis)),
  signInUntil: Schema.NullOr(Millis),
  since: Schema.NullOr(Millis),
  standing: Standing,
  week: LimitWindow,
  working: Schema.Number,
});

export type Account = typeof Account.Type;

export const Policy = Schema.Struct({
  agentsPerAccount: Schema.Number,
  sessionCutoff: Schema.Number,
  weeklyCutoff: Schema.Number,
});

export type Policy = typeof Policy.Type;

export const Pool = Schema.Struct({
  decision: Schema.String,
  next: Schema.NullOr(Schema.String),
  notes: Schema.Array(Schema.String),
  order: Schema.Array(Schema.String),
  policy: Policy,
  revision: Schema.String,
});

export type Pool = typeof Pool.Type;

export const SessionState = Schema.Literals(["working", "idle", "blocked"]);

export type SessionState = typeof SessionState.Type;

export const LiveSession = Schema.Struct({
  account: Schema.NullOr(Schema.String),
  app: Schema.NullOr(Schema.String),
  cwd: Schema.String,
  entrypoint: Schema.String,
  host: Schema.String,
  id: Schema.String,
  label: Schema.String,
  row: Schema.String,
  since: Millis,
  state: SessionState,
});

export type LiveSession = typeof LiveSession.Type;

export const AppLink = Schema.Struct({ connected: Schema.Boolean });

export const Grant = Schema.Struct({
  account: Schema.String,
  allowance: Schema.Number,
  credentialId: Schema.String,
  expiresAt: Millis,
  lastRequestAt: Schema.NullOr(Millis),
  monthlyCap: Schema.Number,
  observedAt: Millis,
  organization: Schema.String,
  proxyUsd: Schema.Number,
  recorded: Schema.Number,
  remaining: Schema.Number,
  renewsAt: Millis,
  requests: Schema.Number,
  startsAt: Millis,
  unpriced: Schema.Number,
});

export type Grant = typeof Grant.Type;

export const Credits = Schema.Struct({ api: Schema.Array(Grant) });

export type Credits = typeof Credits.Type;

export const MoveCause = Schema.Literals([
  "limit",
  "over",
  "early",
  "restart",
  "start",
]);

export type MoveCause = typeof MoveCause.Type;

export const WindowKind = Schema.Literals(["fiveHour", "week"]);

export type WindowKind = typeof WindowKind.Type;

export const History = Schema.Struct({
  history: Schema.Array(
    Schema.Struct({
      account: Schema.String,
      kind: WindowKind,
      points: Schema.Array(Schema.Tuple([Millis, Schema.Number])),
    })
  ),
  hosts: Schema.Array(
    Schema.Struct({
      host: Schema.String,
      seats: Schema.Number,
      seenAt: Schema.NullOr(Millis),
    })
  ),
  moves: Schema.Array(
    Schema.Struct({
      at: Millis,
      cause: MoveCause,
      from: Schema.NullOr(Schema.String),
      label: Schema.NullOr(Schema.String),
      session: Schema.String,
      to: Schema.String,
    })
  ),
});

export type History = typeof History.Type;

export const Credential = Schema.Struct({
  auth_index: Schema.String,
  created_at: Schema.optionalKey(Schema.String),
  disabled: Schema.Boolean,
  email: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.String),
  name: Schema.String,
  provider: Schema.String,
  requires_sign_in: Schema.optionalKey(Schema.Boolean),
  status: Schema.String,
  status_message: Schema.optionalKey(Schema.String),
  unavailable: Schema.optionalKey(Schema.Boolean),
});

export type Credential = typeof Credential.Type;

export const Credentials = Schema.Struct({ files: Schema.Array(Credential) });

export const SignInProvider = Schema.Literals(["claude", "codex"]);

export type SignInProvider = typeof SignInProvider.Type;

export const SignInStart = Schema.Struct({
  flow: Schema.optionalKey(Schema.String),
  state: Schema.String,
  url: Schema.String,
  user_code: Schema.optionalKey(Schema.String),
});

export const SignInStatus = Schema.Struct({
  error: Schema.optionalKey(Schema.String),
  status: Schema.Literals(["ok", "wait", "error"]),
});

export const PolicyResult = Schema.Struct({
  conflict: Schema.Boolean,
  pool: Pool,
  saved: Schema.Boolean,
});

export type PolicyResult = typeof PolicyResult.Type;

export const Done = Schema.Struct({});

export const LimitUsage = Schema.Struct({
  buckets: Schema.Array(Schema.Struct({ at: Millis, size: Schema.String })),
  coverage: Schema.Struct({ limitsSince: Schema.NullOr(Millis) }),
  rows: Schema.Array(
    Schema.Struct({ key: Schema.String, series: Schema.Array(Schema.Number) })
  ),
});

export type LimitUsage = typeof LimitUsage.Type;
