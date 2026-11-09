import "server-only";
import { Effect } from "effect";

import { ProxyError, runtime } from "@/lib/proxy/proxy";
import type { Proxy } from "@/lib/proxy/proxy";

export type Outcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly reason: string };

export const outcome = <A>(effect: Effect.Effect<A, ProxyError, Proxy>) =>
  effect.pipe(
    Effect.match({
      onFailure: (error): Outcome<A> => ({ ok: false, reason: error.reason }),
      onSuccess: (value): Outcome<A> => ({ ok: true, value }),
    }),
  );

export const attempt = async <A>(effect: Effect.Effect<A, ProxyError, Proxy>) =>
  await runtime.runPromise(outcome(effect));

export const attemptCached = async <A>(path: string, read: () => Promise<A>) =>
  await attempt(
    Effect.tryPromise({
      catch: () =>
        new ProxyError({
          path,
          reason: "no usable answer from the proxy",
        }),
      try: read,
    }),
  );
