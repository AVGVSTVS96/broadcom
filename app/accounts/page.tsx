import { Effect } from "effect";
import type { Metadata } from "next";
import { connection } from "next/server";

import { Accounts } from "@/features/accounts/accounts";
import { RefreshOnStale } from "@/lib/live/client";
import { creditOf, loginOf } from "@/lib/model/accounts";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import { Credentials, Credits } from "@/lib/proxy/schema";

export const metadata: Metadata = { title: "Accounts" };

const settle = <A, B>(
  effect: Effect.Effect<A, { readonly reason: string }>,
  done: (value: A) => B,
  empty: B,
  what: string
) =>
  effect.pipe(
    Effect.match({
      onFailure: (error) => ({
        problem: `${what} didn't load: ${error.reason}`,
        value: empty,
      }),
      onSuccess: (value) => ({ problem: null, value: done(value) }),
    })
  );

const read = async () => {
  await connection();

  return await runtime.runPromise(
    Effect.gen(function* () {
      const proxy = yield* Proxy;

      const [logins, credits] = yield* Effect.all(
        [
          settle(
            proxy.get("/credentials", Credentials),
            (list) => list.files.map(loginOf),
            [],
            "Sign-ins"
          ),
          settle(
            proxy.get("/deck/credits", Credits),
            (view) => view.api.map(creditOf),
            [],
            "API credit"
          ),
        ],
        { concurrency: 2 }
      );

      return {
        credits: credits.value,
        logins: logins.value,
        problems: [logins.problem, credits.problem].filter(
          (problem) => problem !== null
        ),
      };
    })
  );
};

const AccountsPage = async () => (
  <>
    <RefreshOnStale tags={["credits"]} />
    <Accounts {...await read()} at={Date.now()} />
  </>
);

export default AccountsPage;
