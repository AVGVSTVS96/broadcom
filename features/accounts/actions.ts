"use server";

import { Effect, Schema } from "effect";
import { refresh } from "next/cache";

import { Proxy, runtime } from "@/lib/proxy/proxy";
import type { ProxyUnreachable } from "@/lib/proxy/proxy";
import {
  Done,
  Policy,
  PolicyResult,
  SignInProvider,
  SignInStart,
  SignInStatus,
} from "@/lib/proxy/schema";

export type Outcome<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly reason: string };

const run = async <A>(
  task: (proxy: Proxy["Service"]) => Effect.Effect<A, ProxyUnreachable>
) =>
  await runtime.runPromise(
    Effect.gen(function* () {
      return yield* task(yield* Proxy);
    }).pipe(
      Effect.match({
        onFailure: (error): Outcome<A> => ({ ok: false, reason: error.reason }),
        onSuccess: (value): Outcome<A> => ({ ok: true, value }),
      })
    )
  );

const changed = async <A>(outcome: Promise<Outcome<A>>) => {
  const result = await outcome;

  if (result.ok) {
    refresh();
  }

  return result;
};

const named = (name: string) => {
  const trimmed = name.trim();

  return trimmed === ""
    ? Effect.die("A credential needs a name")
    : Effect.succeed(trimmed);
};

export const setDisabled = async (name: string, disabled: boolean) =>
  await changed(
    run((proxy) =>
      named(name).pipe(
        Effect.flatMap((at) =>
          proxy.send(
            "PATCH",
            "/credentials/status",
            { disabled, name: at },
            Done
          )
        )
      )
    )
  );

export const removeCredential = async (name: string) =>
  await changed(
    run((proxy) =>
      named(name).pipe(
        Effect.flatMap((at) =>
          proxy.send("DELETE", "/credentials", { names: [at] }, Done)
        )
      )
    )
  );

export const renewCredential = async (name: string) =>
  await changed(
    run((proxy) =>
      named(name).pipe(
        Effect.flatMap((at) =>
          proxy.send("POST", "/credentials/refresh", { name: at }, Done)
        )
      )
    )
  );

export interface SignInLink {
  readonly state: string;
  readonly url: string;
  readonly code: string | null;
  readonly flow: "code" | "device" | "address";
}

const decodeProvider = Schema.decodeUnknownSync(SignInProvider);

export const startSignIn = async (provider: string, target: string | null) => {
  const query = new URLSearchParams({
    is_webui: "true",
    provider: decodeProvider(provider),
  });

  if (target !== null) {
    query.set("name", target);
  }

  return await run((proxy) =>
    proxy.get(`/oauth/auth-url?${query.toString()}`, SignInStart).pipe(
      Effect.map((start): SignInLink => ({
        code: start.user_code ?? null,
        flow:
          start.flow === "code" || start.flow === "device"
            ? start.flow
            : "address",
        state: start.state,
        url: start.url,
      }))
    )
  );
};

export const signInStatus = async (state: string) => {
  const result = await run((proxy) =>
    Effect.sleep("2 seconds").pipe(
      Effect.andThen(
        proxy.get(
          `/oauth/status?${new URLSearchParams({ state }).toString()}`,
          SignInStatus
        )
      )
    )
  );

  if (result.ok && result.value.status === "ok") {
    refresh();
  }

  return result;
};

const isAddress = (input: string) => {
  try {
    return ["http:", "https:"].includes(new URL(input).protocol);
  } catch {
    return false;
  }
};

export const sendSignInCode = async (
  provider: string,
  state: string,
  input: string
) => {
  const pasted = input.trim();
  const [code = "", pastedState = ""] = pasted.split("#");

  const body: Schema.Json = isAddress(pasted)
    ? { provider: decodeProvider(provider), redirect_url: pasted }
    : {
        code: code.trim(),
        provider: decodeProvider(provider),
        state: pastedState.trim() === "" ? state : pastedState.trim(),
      };

  return await run((proxy) =>
    proxy.send("POST", "/oauth/callback", body, Done)
  );
};

export const cancelSignIn = async (state: string) =>
  await run((proxy) =>
    proxy.send(
      "DELETE",
      `/oauth/session?${new URLSearchParams({ state }).toString()}`,
      null,
      Done
    )
  );

const decodePolicy = Schema.decodeUnknownSync(Policy);

export const previewPolicy = async (policy: Policy, revision: string) =>
  await run((proxy) =>
    proxy.send(
      "POST",
      "/deck/accounts/policy",
      { policy: decodePolicy(policy), revision, save: false },
      PolicyResult
    )
  );

export const savePolicy = async (policy: Policy, revision: string) =>
  await changed(
    run((proxy) =>
      proxy.send(
        "POST",
        "/deck/accounts/policy",
        { policy: decodePolicy(policy), revision, save: true },
        PolicyResult
      )
    )
  );
