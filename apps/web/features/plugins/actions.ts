"use server";

import { spawn } from "node:child_process";
import { once } from "node:events";
import { homedir } from "node:os";
import path from "node:path";

import { refresh } from "next/cache";

import { claudeDir, readSetup } from "@/lib/hex/setup";

export const setPlugin = async (id: string, enabled: boolean) => {
  const { plugins } = await readSetup();

  if (!plugins.some((plugin) => plugin.id === id)) {
    return { ok: false, reason: `No Claude Code plugin ${id}` };
  }

  const child = spawn(
    "claude",
    ["plugin", enabled ? "enable" : "disable", id, "--scope", "user"],
    {
      env:
        claudeDir === path.join(homedir(), ".claude")
          ? process.env
          : { ...process.env, CLAUDE_CONFIG_DIR: claudeDir },
      stdio: ["ignore", "ignore", "pipe"],
    }
  );

  const chunks: Uint8Array[] = [];

  child.stderr.on("data", (chunk: Uint8Array) => {
    chunks.push(chunk);
  });

  await once(child, "close");

  if (child.exitCode !== 0) {
    return {
      ok: false,
      reason: Buffer.concat(chunks).toString("utf-8").trim() || "claude failed",
    };
  }

  refresh();

  return { ok: true, reason: "" };
};
