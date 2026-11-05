import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "tools/oxlint/anti-slop/**",
    "tsconfig.json",
  ],
  sortTailwindcss: {
    functions: ["clsx", "cn", "cva"],
    stylesheet: "./app/globals.css",
  },
});
