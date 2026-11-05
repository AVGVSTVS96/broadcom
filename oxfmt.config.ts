import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "tools/oxlint/anti-slop/**",
  ],
  sortTailwindcss: {
    functions: ["clsx", "cn", "cva"],
    stylesheet: "./app/globals.css",
  },
});
