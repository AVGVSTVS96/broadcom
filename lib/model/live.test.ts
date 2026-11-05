import { expect, test } from "bun:test";

import { handoffs, threadHref, waiting } from "@/lib/model/live";
import type { Move } from "@/lib/model/live";
import type { LiveSession } from "@/lib/proxy/schema";

const hour = 3_600_000;

const now = Date.parse("2026-11-05T14:30:00Z");

const move = (
  at: number,
  cause: Move["cause"],
  from: string | null,
  to: string,
  label: string | null = null
): Move => ({ at, cause, from, label, session: `${at}${label}`, to });

test("handoffs count starts and moves per hour, and group moves by route", () => {
  const burst = now - 2 * hour;

  const digest = handoffs(
    [
      move(now - 25 * hour, "limit", "a", "b"),
      move(now - 3 * hour, "start", null, "a"),
      move(burst, "limit", "a", "b", "one"),
      move(burst + 5000, "limit", "a", "b", "two"),
      move(burst + 6000, "limit", "a", "b", "two"),
      move(burst + 20 * 60_000, "limit", "a", "b", "four"),
      move(now - hour, "early", "b", "a", "three"),
    ],
    now
  );

  expect(digest.started).toBe(1);
  expect(digest.moved).toEqual({ early: 1, limit: 4 });
  expect(digest.recent.map((group) => [group.count, group.labels])).toEqual([
    [1, ["three"]],
    [4, ["one", "two", "four"]],
  ]);

  const a = digest.lanes.find((lane) => lane.account === "a");

  expect(a?.left.reduce((sum, count) => sum + count, 0)).toBe(4);
  expect(a?.started.reduce((sum, count) => sum + count, 0)).toBe(1);
});

test("thread rows link to their conversation where the app has links", () => {
  expect(threadHref("t:telegram:-1001234:56")).toBe("https://t.me/c/1234/56");
  expect(threadHref("t:t3:abc")).toBe("t3-thread://v1/abc");
  expect(threadHref("t:buzz:abc")).toBeNull();
  expect(threadHref("p:local:/home")).toBeNull();
});

test("the worst hour of one session's moves in the day reads as a bounce", () => {
  const burst = now - 5 * hour;

  const digest = handoffs(
    [
      ...Array.from({ length: 7 }, (_, index) =>
        move(
          burst + index * 5 * 60_000,
          "limit",
          index % 2 === 0 ? "a" : "b",
          index % 2 === 0 ? "b" : "a",
          "busy"
        )
      ),
      move(now - 20 * 60_000, "limit", "a", "c", "busy"),
      move(now - 2 * hour, "limit", "a", "b", "calm"),
    ].map((one) => ({ ...one, session: one.label ?? "" })),
    now
  );

  expect(digest.bounce).toEqual({
    at: burst + 30 * 60_000,
    between: ["a", "b"],
    count: 7,
    label: "busy",
  });
});

const session = (
  id: string,
  since: number,
  state: LiveSession["state"],
  account: string | null,
  label = id
): LiveSession => ({
  account,
  app: null,
  cwd: "/",
  entrypoint: "cli",
  host: "server",
  id,
  label,
  row: "p:local:/",
  since,
  state,
});

test("only blocked sessions the proxy still seats, on a thread nothing newer took over, wait", () => {
  expect(
    waiting([
      session("old", now - 30 * 24 * hour, "blocked", null),
      session("asks", now - hour, "blocked", "a"),
      session("dm", now - 3 * hour, "blocked", "a", "DM"),
      session("dm2", now - hour, "working", "a", "DM"),
    ]).map((one) => one.id)
  ).toEqual(["asks"]);
});
