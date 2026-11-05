import "server-only";
import { Effect } from "effect";

import { ProxyUnreachable, runtime } from "@/lib/proxy/proxy";
import type { Proxy } from "@/lib/proxy/proxy";

export type Outcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly reason: string };

export const attempt = async <A>(
  effect: Effect.Effect<A, ProxyUnreachable, Proxy>
) =>
  await runtime.runPromise(
    effect.pipe(
      Effect.match({
        onFailure: (error): Outcome<A> => ({ ok: false, reason: error.reason }),
        onSuccess: (value): Outcome<A> => ({ ok: true, value }),
      })
    )
  );

export const attemptCached = async <A>(path: string, read: () => Promise<A>) =>
  await attempt(
    Effect.tryPromise({
      catch: (cause) =>
        new ProxyUnreachable({
          path,
          reason: cause instanceof Error ? cause.message : String(cause),
        }),
      try: read,
    })
  );
