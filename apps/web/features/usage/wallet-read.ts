import "server-only";
import { Effect } from "effect";

import { readLive } from "@/lib/live/server";
import { namesOf } from "@/lib/model/names";
import { walletOf } from "@/lib/model/wallet";
import { Proxy, runtime } from "@/lib/proxy/proxy";
import { Config, Credits, UsageView } from "@/lib/proxy/schema";

const spendBy = (by: "account" | "harness") =>
  Effect.gen(function* () {
    return yield* (yield* Proxy).get(
      `/deck/usage?range=30d&by=${by}&measure=api&limit=100`,
      UsageView,
    );
  });

const spent = (view: UsageView, prefix: string) =>
  Object.fromEntries(view.rows.map((row) => [row.key.slice(prefix.length), row.amount.apiUsd]));

export const readWallet = async () => {
  const live = await readLive();

  const { accounts, harness, credits, config } = await runtime.runPromise(
    Effect.all(
      {
        accounts: spendBy("account"),
        config: Effect.gen(function* () {
          return yield* (yield* Proxy).get("/config", Config);
        }),
        credits: Effect.gen(function* () {
          return yield* (yield* Proxy).get("/deck/credits", Credits);
        }),
        harness: spendBy("harness"),
      },
      { concurrency: "unbounded" },
    ),
  );

  const names = namesOf(accounts.facets.account ?? [], credits.api);

  return walletOf({
    byAccount: spent(accounts, "a:"),
    byHarness: spent(harness, "h:"),
    grants: credits.api.map((grant) => ({
      allowance: grant.allowance,
      expiresAt: grant.expiresAt,
      id: grant.credentialId,
      name: names[grant.credentialId] ?? "API key",
      remaining: grant.remaining,
    })),
    plans: (config.usage?.plans ?? []).map((plan) => ({
      monthly: plan["monthly-usd"],
      name: plan.name,
      providers: plan.providers ?? [],
      since: plan.since === undefined ? null : Date.parse(plan.since),
    })),
    seats: Object.values(live.accounts).map((account) => ({
      id: account.id,
      name: names[account.id] ?? account.label,
      plan: account.plan,
    })),
    total: accounts.totals.apiUsd,
  });
};
