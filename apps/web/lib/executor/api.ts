import "server-only";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { Data, Effect, Option, Predicate, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { cacheLife, cacheTag, updateTag } from "next/cache";

import type {
  ExecutorAccount,
  ExecutorApp,
  ExecutorOverview,
  SourceFile,
} from "@/lib/model/executor";

const home = homedir();

export const executorUrl = process.env.BROADCOM_EXECUTOR_API ?? "https://app.executor.sh";

const tokenFile = process.env.BROADCOM_EXECUTOR_TOKEN ?? path.join(home, ".config/executor/token");

const appsDir = process.env.BROADCOM_EXECUTOR_APPS ?? path.join(home, "Developer/executor-apps");

export class ExecutorRefused extends Data.TaggedError("ExecutorRefused")<{
  readonly reason: string;
}> {}

type Decodable = Schema.Top & { readonly DecodingServices: never };

const Problem = Schema.Struct({ message: Schema.String });

const token = Effect.tryPromise({
  catch: () => new ExecutorRefused({ reason: "Can't read the Executor token" }),
  try: async () => {
    const text = await readFile(/*turbopackIgnore: true*/ tokenFile, "utf-8");

    return text.trim();
  },
});

const call = <S extends Decodable>(route: string, schema: S, body?: Schema.Json) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const request = (
      body === undefined
        ? HttpClientRequest.get(`${executorUrl}${route}`)
        : HttpClientRequest.post(`${executorUrl}${route}`).pipe(
            HttpClientRequest.bodyJsonUnsafe(body),
          )
    ).pipe(HttpClientRequest.bearerToken(yield* token));

    const response = yield* client
      .execute(request)
      .pipe(Effect.mapError((cause) => new ExecutorRefused({ reason: cause.message })));

    const data = yield* response.json.pipe(Effect.orElseSucceed(() => null));

    if (response.status >= 300) {
      return yield* new ExecutorRefused({
        reason: Option.match(Schema.decodeUnknownOption(Problem)(data), {
          onNone: () => `Executor answered ${response.status}`,
          onSome: (problem) => problem.message,
        }),
      });
    }

    return yield* Schema.decodeUnknownEffect(schema)(data).pipe(
      Effect.mapError((cause) => new ExecutorRefused({ reason: cause.message })),
    );
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.mapError((failure) =>
      Predicate.isTagged(failure, "ExecutorRefused")
        ? failure
        : new ExecutorRefused({ reason: "Executor didn't answer" }),
    ),
    Effect.provide(FetchHttpClient.layer),
  );

const Context = Schema.Struct({ organization: Schema.String });

const organization = call("/api/context", Context).pipe(
  Effect.map((context) => `/api/organizations/${encodeURIComponent(context.organization)}`),
);

const InventoryApp = Schema.Struct({
  activeVersion: Schema.NullOr(Schema.String),
  id: Schema.String,
  name: Schema.String,
  requirements: Schema.Struct({
    accounts: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }),
  slug: Schema.String,
});

type InventoryApp = typeof InventoryApp.Type;

const Inventory = Schema.Struct({ apps: Schema.Array(InventoryApp) });

const Versions = Schema.Array(Schema.Struct({ createdAt: Schema.String, id: Schema.String }));

const Linked = Schema.Array(
  Schema.Struct({
    account: Schema.Struct({ label: Schema.optional(Schema.String) }),
    health: Schema.optional(
      Schema.Struct({
        apps: Schema.optional(
          Schema.Array(
            Schema.Struct({
              check: Schema.Struct({
                checkedAt: Schema.optional(Schema.String),
                status: Schema.String,
              }),
            }),
          ),
        ),
        info: Schema.optional(
          Schema.NullOr(Schema.Struct({ email: Schema.optional(Schema.String) })),
        ),
      }),
    ),
    requirement: Schema.String,
  }),
);

const Release = Schema.Struct({ version: Schema.String });

const Source = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({
      content: Schema.NullOr(Schema.String),
      path: Schema.String,
    }),
  ),
});

const Deployed = Schema.Struct({
  version: Schema.optional(Schema.NullOr(Schema.Struct({ id: Schema.String }))),
});

const Connection = Schema.Struct({ url: Schema.String });

const Package = Schema.Struct({
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});

const localDir = (slug: string) =>
  slug === "" || slug === "." || slug === ".." || slug.includes("/")
    ? Effect.fail(new ExecutorRefused({ reason: `No Executor app ${slug}` }))
    : Effect.succeed(path.join(appsDir, slug));

const inside = (dir: string, file: string) => {
  const full = path.resolve(dir, file);

  return full.startsWith(`${dir}${path.sep}`) ? full : null;
};

const readLocal = (file: string | null) =>
  Effect.promise(async () =>
    file === null
      ? null
      : await readFile(/*turbopackIgnore: true*/ file, "utf-8").catch(() => null),
  );

const pinnedRelease = (dir: string) =>
  readLocal(path.join(dir, "package.json")).pipe(
    Effect.map((text) =>
      text === null
        ? null
        : Option.match(Schema.decodeUnknownOption(Schema.fromJsonString(Package))(text), {
            onNone: () => null,
            onSome: (pkg) => pkg.dependencies?.apps ?? null,
          }),
    ),
  );

const accountOf = (link: (typeof Linked.Type)[number]): ExecutorAccount => {
  const check = link.health?.apps?.at(0)?.check;

  return {
    checkedAt: check?.checkedAt ?? null,
    health: check?.status ?? null,
    label: link.health?.info?.email ?? link.account.label ?? link.requirement,
    requirement: link.requirement,
  };
};

const describe = (org: string, app: InventoryApp) =>
  Effect.gen(function* () {
    const route = `${org}/apps/${encodeURIComponent(app.id)}`;
    const dir = yield* localDir(app.slug);

    const local = existsSync(/*turbopackIgnore: true*/ path.join(dir, "index.ts"));

    const [versions, linked, pinned] = yield* Effect.all(
      [
        call(`${route}/versions`, Versions).pipe(Effect.orElseSucceed(() => [])),
        call(`${route}/accounts/user`, Linked).pipe(Effect.orElseSucceed(() => [])),
        local ? pinnedRelease(dir) : Effect.succeed(null),
      ],
      { concurrency: "unbounded" },
    );

    return {
      accounts: linked.map(accountOf),
      deployedAt: versions.find((version) => version.id === app.activeVersion)?.createdAt ?? null,
      id: app.id,
      local,
      name: app.name,
      pinned,
      requirements: Object.keys(app.requirements.accounts ?? {}).toSorted(),
      running: app.activeVersion !== null,
      slug: app.slug,
      versions: versions.length,
    } satisfies ExecutorApp;
  });

const findApp = (org: string, slug: string) =>
  call(`${org}/inventory`, Inventory).pipe(
    Effect.flatMap(({ apps }) =>
      Option.match(Option.fromNullishOr(apps.find((app) => app.slug === slug)), {
        onNone: () => Effect.fail(new ExecutorRefused({ reason: `No Executor app ${slug}` })),
        onSome: Effect.succeed,
      }),
    ),
  );

const source = (org: string, app: InventoryApp) =>
  Effect.gen(function* () {
    const dir = yield* localDir(app.slug);

    const { files } = yield* call(`${org}/apps/${encodeURIComponent(app.id)}/source`, Source);

    const deployed = new Map(files.map((file) => [file.path, file.content]));

    const paths = [...new Set(["index.ts", "package.json", ...deployed.keys()])].toSorted();

    return yield* Effect.all(
      paths.map((file) =>
        readLocal(inside(dir, file)).pipe(
          Effect.map((local): SourceFile => ({
            deployed: deployed.get(file) ?? null,
            local,
            path: file,
          })),
        ),
      ),
    );
  });

export type Answer<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly reason: string };

const answer = async <A>(program: Effect.Effect<A, ExecutorRefused>): Promise<Answer<A>> =>
  await Effect.runPromise(
    program.pipe(
      Effect.match({
        onFailure: (error) => ({ ok: false, reason: error.reason }) as const,
        onSuccess: (value) => ({ ok: true, value }) as const,
      }),
    ),
  );

const tag = "executor";

export const readOverview = async (): Promise<Answer<ExecutorOverview>> => {
  "use cache";
  cacheLife({ expire: 300, revalidate: 30, stale: 30 });
  cacheTag(tag);

  return await answer(
    Effect.gen(function* () {
      const org = yield* organization;

      const [{ apps }, release] = yield* Effect.all(
        [
          call(`${org}/inventory`, Inventory),
          call(`${org}/framework/release`, Release).pipe(Effect.orElseSucceed(() => null)),
        ],
        { concurrency: "unbounded" },
      );

      return {
        apps: yield* Effect.all(
          apps.map((app) => describe(org, app)),
          { concurrency: "unbounded" },
        ),
        framework: release?.version ?? null,
      };
    }),
  );
};

export const readSource = async (slug: string) =>
  await answer(
    Effect.gen(function* () {
      const org = yield* organization;

      return yield* source(org, yield* findApp(org, slug));
    }),
  );

export const saveSource = async (slug: string, file: string, text: string) =>
  await answer(
    Effect.gen(function* () {
      const full = inside(yield* localDir(slug), file);

      if (full === null) {
        return yield* new ExecutorRefused({
          reason: `Can't save ${file} outside ${slug}`,
        });
      }

      yield* Effect.tryPromise({
        catch: () => new ExecutorRefused({ reason: `Can't save ${file}` }),
        try: async () => {
          await mkdir(/*turbopackIgnore: true*/ path.dirname(full), {
            recursive: true,
          });
          await writeFile(/*turbopackIgnore: true*/ full, text);
        },
      });

      return file;
    }),
  );

export const deploy = async (slug: string) => {
  const done = await answer(
    Effect.gen(function* () {
      const org = yield* organization;
      const app = yield* findApp(org, slug);
      const files = yield* source(org, app);

      const uploads = files.flatMap((file) =>
        file.local === null ? [] : [{ content: file.local, path: file.path }],
      );

      const result = yield* call(`${org}/apps/${encodeURIComponent(app.id)}/deploy`, Deployed, {
        files: uploads,
      });

      return { files: uploads.length, version: result.version?.id ?? null };
    }),
  );

  updateTag(tag);

  return done;
};

export const connect = async (slug: string, requirement: string) => {
  const done = await answer(
    Effect.gen(function* () {
      const org = yield* organization;
      const app = yield* findApp(org, slug);

      if (!Object.hasOwn(app.requirements.accounts ?? {}, requirement)) {
        return yield* new ExecutorRefused({
          reason: `${app.name} has no account called ${requirement}`,
        });
      }

      const { url } = yield* call(
        `${org}/apps/${encodeURIComponent(app.id)}/accounts/user/${encodeURIComponent(requirement)}/connections`,
        Connection,
        {},
      );

      return url;
    }),
  );

  updateTag(tag);

  return done;
};
