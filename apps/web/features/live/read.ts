import "server-only";
import { Effect } from "effect";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";

import { handoffs } from "@/lib/pool/live";
import type { Handoffs } from "@/lib/pool/live";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import { Credits, Moves } from "@/lib/proxy/schema";
import type { Grant } from "@/lib/proxy/schema";

export interface LiveData {
  readonly now: number;
  readonly handoffs: Handoffs | null;
  readonly grants: readonly Pick<Grant, "account" | "credentialId">[];
}

const readHandoffs = async () => {
  "use cache";
  cacheLife({ expire: 300, revalidate: 30, stale: 30 });
  cacheTag("accounts");

  const now = Date.now();

  return await runtime.runPromise(
    Effect.gen(function* () {
      const { moves } = yield* (yield* Proxy).get("/deck/accounts", Moves);

      return handoffs(moves, now);
    }),
  );
};

const readGrants = async () =>
  await runtime.runPromise(
    Effect.gen(function* () {
      const credits = yield* (yield* Proxy).get("/deck/credits", Credits);

      return credits.api.map((grant) => ({
        account: grant.account,
        credentialId: grant.credentialId,
      }));
    }).pipe(Effect.orElseSucceed(() => [])),
  );

export const readLiveData = async (): Promise<LiveData> => {
  await connection();

  const [moves, grants] = await Promise.all([readHandoffs().catch(() => null), readGrants()]);

  return { grants, handoffs: moves, now: Date.now() };
};
