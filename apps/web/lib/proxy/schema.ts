import { Schema, SchemaTransformation } from "effect";

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

export const Standing = Schema.Literals(["next", "open", "tight", "limited", "signed-out"]);

export type Standing = typeof Standing.Type;

export const Account = Schema.Struct({
  atLimit: Schema.NullOr(
    Schema.Struct({ available: Schema.Boolean, nextAt: Schema.NullOr(Millis) }),
  ),
  cloud: Schema.NullOr(
    Schema.Struct({
      expiresAt: Schema.NullOr(Millis),
      limit: NullableNumber,
      remaining: NullableNumber,
      sampledAt: Millis,
      used: NullableNumber,
    }),
  ),
  fiveHour: LimitWindow,
  heldResets: Schema.Array(
    Schema.Struct({
      expiresAt: Schema.NullOr(Millis),
      kind: Schema.String,
      left: Schema.Number,
    }),
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

const moveCauses = ["limit", "over", "early", "restart", "start", "other"] as const;

export const MoveCause = Schema.String.pipe(
  Schema.decodeTo(
    Schema.Literals(moveCauses),
    SchemaTransformation.transform<(typeof moveCauses)[number], string>({
      decode: (cause) => moveCauses.find((known) => known === cause) ?? "other",
      encode: (cause) => cause,
    }),
  ),
);

export type MoveCause = typeof MoveCause.Type;

export const WindowKind = Schema.Literals(["fiveHour", "week"]);

export type WindowKind = typeof WindowKind.Type;

export const History = Schema.Struct({
  history: Schema.Array(
    Schema.Struct({
      account: Schema.String,
      kind: WindowKind,
      points: Schema.Array(Schema.Tuple([Millis, Schema.Number])),
    }),
  ),
  hosts: Schema.Array(
    Schema.Struct({
      host: Schema.String,
      seats: Schema.Number,
      seenAt: Schema.NullOr(Millis),
    }),
  ),
  moves: Schema.Array(
    Schema.Struct({
      at: Millis,
      cause: MoveCause,
      from: Schema.NullOr(Schema.String),
      label: Schema.NullOr(Schema.String),
      session: Schema.String,
      to: Schema.String,
    }),
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
  rows: Schema.Array(Schema.Struct({ key: Schema.String, series: Schema.Array(Schema.Number) })),
});

export type LimitUsage = typeof LimitUsage.Type;

export const UsageAmount = Schema.Struct({
  apiUsd: Schema.Number,
  cacheRead: Schema.Number,
  input: Schema.Number,
  output: Schema.Number,
  planUsd: Schema.Number,
  requests: Schema.Number,
  tokens: Schema.Number,
});

export type UsageAmount = typeof UsageAmount.Type;

export const UsagePoints = Schema.Struct({
  fiveHour: NullableNumber,
  week: NullableNumber,
});

export type UsagePoints = typeof UsagePoints.Type;

export const UsageWho = Schema.Struct({
  href: Schema.optionalKey(Schema.NullOr(Schema.String)),
  kind: Schema.Literals(["thread", "job", "session", "action", "project"]),
});

export const UsageRow = Schema.Struct({
  agentSdk: Schema.Number,
  amount: UsageAmount,
  byAccount: Schema.Array(
    Schema.Struct({
      account: Schema.String,
      fiveHour: NullableNumber,
      week: NullableNumber,
    }),
  ),
  detail: Schema.String,
  entrypoint: Schema.String,
  key: Schema.String,
  label: Schema.String,
  lastActiveAt: Millis,
  points: UsagePoints,
  series: Schema.Array(Schema.Number),
  sessions: Schema.Number,
  who: Schema.NullOr(UsageWho),
});

export type UsageRow = typeof UsageRow.Type;

export const UsageTotals = Schema.Struct({
  ...UsageAmount.fields,
  cacheHitRate: Schema.Number,
  points: UsagePoints,
  sessions: Schema.Number,
});

export type UsageTotals = typeof UsageTotals.Type;

export const BucketSize = Schema.Literals(["1h", "4h", "1d", "1w"]);

export type BucketSize = typeof BucketSize.Type;

export const UsageView = Schema.Struct({
  agentSdk: Schema.Struct({
    apiUsd: Schema.Number,
    factor: Schema.Number,
    fiveHour: NullableNumber,
    share: Schema.Number,
  }),
  buckets: Schema.Array(Schema.Struct({ at: Millis, size: BucketSize })),
  coverage: Schema.Struct({ limitsSince: Schema.NullOr(Millis) }),
  facets: Schema.Record(
    Schema.String,
    Schema.Array(
      Schema.Struct({
        count: Schema.Number,
        id: Schema.String,
        label: Schema.String,
      }),
    ),
  ),
  period: Schema.Struct({
    from: Millis,
    timezone: Schema.String,
    to: Millis,
  }),
  previous: Schema.NullOr(UsageTotals),
  rowCount: Schema.Number,
  rows: Schema.Array(UsageRow),
  series: Schema.Array(Schema.Struct({ key: Schema.String, values: Schema.Array(Schema.Number) })),
  sources: Schema.Struct({ proxySince: Schema.NullOr(Millis) }),
  totals: UsageTotals,
});

export type UsageView = typeof UsageView.Type;

const Maybe = <S extends Schema.Top>(schema: S) => Schema.optionalKey(schema);

export const Config = Schema.Struct({
  management: Maybe(
    Schema.Struct({
      "allow-remote": Maybe(Schema.Boolean),
      "disable-auto-update-panel": Maybe(Schema.Boolean),
    }),
  ),
  oauth: Maybe(Schema.Struct({ "auth-dir": Maybe(Schema.String) })),
  requests: Maybe(Schema.Struct({ "passthrough-headers": Maybe(Schema.Boolean) })),
  routing: Maybe(
    Schema.Struct({
      "force-model-prefix": Maybe(Schema.Boolean),
      pool: Maybe(Schema.Struct({ "reset-command": Maybe(Schema.String) })),
      "session-affinity": Maybe(Schema.Boolean),
      strategy: Maybe(Schema.String),
    }),
  ),
  server: Maybe(Schema.Struct({ host: Maybe(Schema.String), port: Maybe(Schema.Number) })),
  usage: Maybe(
    Schema.Struct({
      "device-label": Maybe(Schema.String),
      "github-actions": Maybe(Schema.Boolean),
      plans: Maybe(
        Schema.Array(
          Schema.Struct({
            "monthly-usd": Schema.Number,
            name: Schema.String,
            providers: Maybe(Schema.Array(Schema.String)),
            since: Maybe(Schema.String),
          }),
        ),
      ),
      "state-dir": Maybe(Schema.String),
      timezone: Maybe(Schema.String),
    }),
  ),
});

export type Config = typeof Config.Type;
