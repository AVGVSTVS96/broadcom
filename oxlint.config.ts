import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

export default defineConfig({
  extends: [core, react, next, antiSlop],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "apps/web/components/ui/**",
    "tools/oxlint/anti-slop-effect/**",
    "target/**",
  ],
  jsPlugins: [
    { name: "no-comments", specifier: "./tools/oxlint/no-comments.ts" },
    { name: "anti-slop-effect", specifier: "./tools/oxlint/anti-slop-effect/index.ts" },
  ],
  options: { reportUnusedDisableDirectives: "error", typeAware: true },
  rules: {
    "anti-slop-effect/no-manual-effect-error-tag": "error",
    "anti-slop-effect/no-manual-tag-comparison": "error",
    "anti-slop-effect/no-manual-tagged-construction": "error",
    "anti-slop-effect/no-service-constructor-imports": "error",
    "anti-slop-effect/prefer-effect-match": "error",
    "eslint/func-names": ["error", "as-needed", { generators: "never" }],
    "eslint/max-classes-per-file": "off",
    "eslint/no-inline-comments": "off",
    "eslint/no-redeclare": "off",
    "import/no-cycle": "error",
    "no-comments/no-comments": "error",
    "oxc/no-accumulating-spread": "error",
    "react/hook-use-state": "off",
    "typescript/consistent-indexed-object-style": "off",
  },
});
