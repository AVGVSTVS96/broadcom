import "server-only";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { buffer } from "node:stream/consumers";

const env = {
  ...process.env,
  GIT_OPTIONAL_LOCKS: "0",
  GIT_TERMINAL_PROMPT: "0",
};

export const gitBytes = async (cwd: string, ...args: string[]) => {
  const child = spawn("git", args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "ignore"],
  });

  const closed = once(child, "close");
  const data = await buffer(child.stdout);

  await closed;

  if (child.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} exited with ${String(child.exitCode)}`);
  }

  return data;
};

export const git = async (cwd: string, ...args: string[]) => {
  const out = await gitBytes(cwd, ...args);

  return out.toString("utf-8");
};

export const tryGit = async (cwd: string, ...args: string[]) =>
  await git(cwd, ...args).catch(() => null);
