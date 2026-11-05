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

import { decodeLiveEvent } from "@/lib/live/event";
import type { LiveEvent } from "@/lib/live/event";

const base = process.env.BROADCOM_PROXY ?? "http://100.113.223.113:8317";

const keyFile =
  process.env.BROADCOM_KEY_FILE ??
  path.join(homedir(), ".config/cliproxyapi/key");

export class ProxyUnreachable extends Data.TaggedError("ProxyUnreachable")<{
  readonly path: string;
  readonly reason: string;
}> {}

type Decodable = Schema.Top & { readonly DecodingServices: never };

export class Proxy extends Context.Service<
  Proxy,
  {
    readonly get: <S extends Decodable>(
      path: string,
      schema: S
    ) => Effect.Effect<S["Type"], ProxyUnreachable>;
    readonly send: <S extends Decodable>(
      method: "POST" | "PUT" | "PATCH" | "DELETE",
      path: string,
      body: Schema.Json,
      schema: S
    ) => Effect.Effect<S["Type"], ProxyUnreachable>;
    readonly live: Stream.Stream<LiveEvent, ProxyUnreachable>;
  }
>()("Proxy") {}

const management = `${base}/v8/management`;

const decodeRefusal = Schema.decodeUnknownOption(
  Schema.Struct({ error: Schema.String })
);

const refusal = (at: string, status: number, body: Schema.Json) =>
  new ProxyUnreachable({
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
      readFileSync(/*turbopackIgnore: true*/ keyFile, "utf-8").trim()
    );

    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(management)),
      HttpClient.mapRequest(HttpClientRequest.bearerToken(key))
    );

    const decode = <S extends Decodable>(
      at: string,
      schema: S,
      request: HttpClientRequest.HttpClientRequest
    ) =>
      client.execute(request).pipe(
        Effect.mapError(
          (cause) => new ProxyUnreachable({ path: at, reason: cause.message })
        ),
        Effect.flatMap((response) =>
          response.json.pipe(
            Effect.orElseSucceed(() => null),
            Effect.filterOrFail(
              () => response.status < 400,
              (body) => refusal(at, response.status, body)
            )
          )
        ),
        Effect.flatMap((body) =>
          Schema.decodeUnknownEffect(schema)(body).pipe(
            Effect.mapError(
              (cause) =>
                new ProxyUnreachable({ path: at, reason: cause.message })
            )
          )
        )
      );

    return {
      get: (at, schema) => decode(at, schema, HttpClientRequest.get(at)),
      live: HttpClient.filterStatusOk(client)
        .execute(HttpClientRequest.get("/deck/events"))
        .pipe(
          Effect.map((response) => response.stream),
          Stream.unwrap,
          Stream.decodeText,
          Stream.pipeThroughChannel(Sse.decode()),
          Stream.filterMap((event) => {
            const decoded = Predicate.isTagged(event, "Event")
              ? decodeLiveEvent(event.data)
              : null;

            return decoded === null ? Result.failVoid : Result.succeed(decoded);
          }),
          Stream.mapError(
            (cause) =>
              new ProxyUnreachable({
                path: "/deck/events",
                reason: Predicate.isTagged(cause, "Retry")
                  ? "retry"
                  : cause.message,
              })
          )
        ),
      send: (method, at, body, schema) =>
        decode(
          at,
          schema,
          HttpClientRequest.make(method)(at).pipe(
            HttpClientRequest.bodyJsonUnsafe(body)
          )
        ),
    };
  })
).pipe(Layer.provide(FetchHttpClient.layer));

export const runtime = ManagedRuntime.make(ProxyLive);
