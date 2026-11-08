import "server-only";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import {
  Context,
  Data,
  Effect,
  Layer,
  ManagedRuntime,
  Option,
  Predicate,
  Result,
  Schema,
  Stream,
} from "effect";
import { Sse } from "effect/encoding";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

const proxyBase = process.env.BROADCOM_PROXY ?? "http://127.0.0.1:8317";
const usageBase = process.env.BROADCOM_USAGE ?? "http://127.0.0.1:8320";

export type Source = "proxy" | "usage";

const usagePaths = ["/deck/usage", "/deck/sessions", "/deck/credits"];

const sourceOf = (at: string): Source =>
  usagePaths.some((prefix) => at.startsWith(prefix)) ? "usage" : "proxy";

const keyFile = process.env.BROADCOM_KEY_FILE ?? path.join(homedir(), ".config/cliproxyapi/key");

export class ProxyError extends Data.TaggedError("ProxyError")<{
  readonly path: string;
  readonly reason: string;
}> {}

type Decodable = Schema.Top & { readonly DecodingServices: never };

export class Proxy extends Context.Service<
  Proxy,
  {
    readonly get: <S extends Decodable>(
      path: string,
      schema: S,
    ) => Effect.Effect<S["Type"], ProxyError>;
    readonly send: <S extends Decodable>(
      method: "POST" | "PUT" | "PATCH" | "DELETE",
      path: string,
      body: Schema.Json,
      schema: S,
    ) => Effect.Effect<S["Type"], ProxyError>;
    readonly events: (source: Source) => Stream.Stream<string, ProxyError>;
  }
>()("Proxy") {}

const decodeRefusal = Schema.decodeUnknownOption(Schema.Struct({ error: Schema.String }));

const refusal = (at: string, status: number, body: Schema.Json) =>
  new ProxyError({
    path: at,
    reason: Option.match(decodeRefusal(body), {
      onNone: () => `HTTP ${status}`,
      onSome: (refused) => refused.error,
    }),
  });

export const ProxyLive = Layer.effect(
  Proxy,
  Effect.gen(function* () {
    const key = yield* Effect.sync(() =>
      readFileSync(/*turbopackIgnore: true*/ keyFile, "utf-8").trim(),
    );

    const http = yield* HttpClient.HttpClient;

    const clientFor = (base: string) =>
      http.pipe(
        HttpClient.mapRequest(HttpClientRequest.prependUrl(`${base}/v8/management`)),
        HttpClient.mapRequest(HttpClientRequest.bearerToken(key)),
      );

    const clients = {
      proxy: clientFor(proxyBase),
      usage: clientFor(usageBase),
    } satisfies Record<Source, HttpClient.HttpClient>;

    const decode = <S extends Decodable>(
      at: string,
      schema: S,
      request: HttpClientRequest.HttpClientRequest,
    ) =>
      clients[sourceOf(at)].execute(request).pipe(
        Effect.mapError((cause) => new ProxyError({ path: at, reason: cause.message })),
        Effect.flatMap((response) =>
          response.json.pipe(
            Effect.orElseSucceed(() => null),
            Effect.filterOrFail(
              () => response.status < 400,
              (body) => refusal(at, response.status, body),
            ),
          ),
        ),
        Effect.flatMap((body) =>
          Schema.decodeUnknownEffect(schema)(body).pipe(
            Effect.mapError((cause) => new ProxyError({ path: at, reason: cause.message })),
          ),
        ),
      );

    return {
      events: (source) =>
        HttpClient.filterStatusOk(clients[source])
          .execute(HttpClientRequest.get("/deck/events"))
          .pipe(
            Effect.map((response) => response.stream),
            Stream.unwrap,
            Stream.decodeText,
            Stream.pipeThroughChannel(Sse.decode()),
            Stream.filterMap((event) =>
              Predicate.isTagged(event, "Event") ? Result.succeed(event.data) : Result.failVoid,
            ),
            Stream.mapError(
              (cause) =>
                new ProxyError({
                  path: "/deck/events",
                  reason: Predicate.isTagged(cause, "Retry") ? "retry" : cause.message,
                }),
            ),
          ),
      get: (at, schema) => decode(at, schema, HttpClientRequest.get(at)),
      send: (method, at, body, schema) =>
        decode(
          at,
          schema,
          HttpClientRequest.make(method)(at).pipe(HttpClientRequest.bodyJsonUnsafe(body)),
        ),
    };
  }),
).pipe(Layer.provide(FetchHttpClient.layer));

export const runtime = ManagedRuntime.make(ProxyLive);
