import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";

const effectHooks = {
  importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect"],
  message:
    "Derive in render and act in the event handler. To talk to something outside React, use useSubscription or useImperative from @/lib/outside.",
  name: "react",
};

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
  overrides: [
    {
      files: ["apps/web/lib/outside.ts"],
      rules: { "no-restricted-imports": "off", "react/exhaustive-deps": "off" },
    },
  ],
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
    "no-restricted-imports": ["error", { paths: [effectHooks] }],
    "oxc/no-accumulating-spread": "error",
    "react/exhaustive-deps": ["error", { additionalHooks: "^(useSubscription|useImperative)$" }],
    "react/hook-use-state": "off",
    "typescript/consistent-indexed-object-style": "off",
  },
});
