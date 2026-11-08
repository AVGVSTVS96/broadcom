import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  cacheComponents: true,
  distDir: process.env.BROADCOM_DIST ?? ".next",
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": { as: "*.css", loaders: ["@tailwindcss/turbopack"] },
    },
  },
};

export default config;
