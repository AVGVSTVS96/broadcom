import { expect, test } from "bun:test";

import { handoffs, threadHref } from "@/lib/model/live";
import type { Move } from "@/lib/model/live";

const hour = 3_600_000;

const now = Date.parse("2026-11-05T14:30:00Z");

const move = (
  at: number,
  cause: Move["cause"],
  from: string | null,
  to: string,
  label: string | null = null
): Move => ({ at, cause, from, label, session: `${at}${label}`, to });

test("handoffs count starts and moves per hour, and group bursts", () => {
  const burst = now - 2 * hour;

  const digest = handoffs(
    [
      move(now - 25 * hour, "limit", "a", "b"),
      move(now - 3 * hour, "start", null, "a"),
      move(burst, "limit", "a", "b", "one"),
      move(burst + 5000, "limit", "a", "b", "two"),
      move(burst + 6000, "limit", "a", "b", "two"),
      move(now - hour, "early", "b", "a", "three"),
    ],
    now
  );

  expect(digest.started).toBe(1);
  expect(digest.moved).toEqual({ early: 1, limit: 3 });
  expect(digest.recent.map((group) => [group.count, group.labels])).toEqual([
    [1, ["three"]],
    [3, ["one", "two"]],
  ]);

  const a = digest.lanes.find((lane) => lane.account === "a");

  expect(a?.left.reduce((sum, count) => sum + count, 0)).toBe(3);
  expect(a?.started.reduce((sum, count) => sum + count, 0)).toBe(1);
});

test("thread rows link to their conversation where the app has links", () => {
  expect(threadHref("t:telegram:-1001234:56")).toBe("https://t.me/c/1234/56");
  expect(threadHref("t:t3:abc")).toBe("t3-thread://v1/abc");
  expect(threadHref("t:buzz:abc")).toBeNull();
  expect(threadHref("p:local:/home")).toBeNull();
});
