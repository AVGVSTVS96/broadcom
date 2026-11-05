import "server-only";
import { Effect, Schema } from "effect";
import { connection } from "next/server";

import { handoffs } from "@/lib/model/live";
import type { Handoffs } from "@/lib/model/live";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import { Credits, History } from "@/lib/proxy/schema";
import type { Grant } from "@/lib/proxy/schema";

const Moves = Schema.Struct({ moves: History.fields.moves });

export interface LiveData {
  readonly now: number;
  readonly handoffs: Handoffs | null;
  readonly grants: readonly Pick<Grant, "account" | "credentialId">[];
}

export const readLiveData = async (): Promise<LiveData> => {
  await connection();

  return await runtime.runPromise(
    Effect.gen(function* () {
      const proxy = yield* Proxy;
      const now = Date.now();

      const { moves, credits } = yield* Effect.all(
        {
          credits: proxy
            .get("/deck/credits", Credits)
            .pipe(Effect.orElseSucceed(() => ({ api: [] }))),
          moves: proxy.get("/deck/accounts", Moves).pipe(
            Effect.map((view) => handoffs(view.moves, now)),
            Effect.orElseSucceed(() => null)
          ),
        },
        { concurrency: "unbounded" }
      );

      return {
        grants: credits.api.map((grant) => ({
          account: grant.account,
          credentialId: grant.credentialId,
        })),
        handoffs: moves,
        now,
      };
    })
  );
};
