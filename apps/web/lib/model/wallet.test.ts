import { describe, expect, test } from "bun:test";

import { labelsOf } from "@/lib/model/usage";
import { walletOf } from "@/lib/model/wallet";

const input = {
  byAccount: { a: 4000, b: 3000, k: 600, none: 2100 },
  byHarness: { claude: 9700, codex: 1000 },
  grants: [{ allowance: 600, expiresAt: 20, id: "k", name: "a API", remaining: 2 }],
  plans: [{ monthly: 200, name: "ChatGPT Pro", providers: ["openai"], since: null }],
  seats: [
    { id: "a", name: "a", plan: "Max 20x" },
    { id: "b", name: "b", plan: "Max 20x" },
    { id: "c", name: "c", plan: "Team" },
  ],
  total: 10_700,
};

describe("walletOf", () => {
  const wallet = walletOf(input);

  test("prices known plans and lists the rest as unpriced", () => {
    expect(wallet.monthly).toBe(600);
    expect(wallet.plans).toEqual(["2 × Claude Max 20x", "ChatGPT Pro"]);
    expect(wallet.unpriced).toEqual(["Team"]);
  });

  test("each source's parts add up to what it ran", () => {
    expect(wallet.sources.map((source) => [source.key, Math.round(source.ran)])).toEqual([
      ["claude", 9100],
      ["plan:ChatGPT Pro", 1000],
      ["credit", 600],
    ]);

    for (const source of wallet.sources) {
      const parts = source.parts.reduce((sum, part) => sum + part.value, 0);

      expect(parts).toBeCloseTo(source.ran);
    }

    expect(wallet.sources[0]?.parts.at(-1)).toEqual({
      key: "none",
      label: "No account",
      value: 2100,
    });
  });

  test("plan dollars leave out what credit paid for", () => {
    expect(wallet.perDollar).toBeCloseTo((10_700 - 600) / 600);
    expect(wallet.credit).toEqual({
      count: 1,
      ends: 20,
      granted: 600,
      left: 2,
    });
  });
});

describe("labelsOf", () => {
  test("rows that share a name show where they ran", () => {
    const labels = labelsOf([
      { key: "t:telegram:-100123", label: "hex" },
      { key: "p:local:/home/someone/hex", label: "hex" },
      { key: "p:hex", label: "hex" },
      { key: "p:github.com/owner/hex", label: "hex" },
      { key: "t:telegram:-100123:45", label: "iikb" },
      { key: "p:github.com/owner/iikb", label: "iikb" },
      { key: "j:seqno", label: "seqno" },
    ]);

    expect([...labels.values()]).toEqual([
      "General",
      "~/hex",
      "hex",
      "owner/hex",
      "iikb",
      "owner/iikb",
      "seqno",
    ]);
  });
});
