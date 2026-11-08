import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image only; `next start` on the host
  // does not support it. The Dockerfile sets STANDALONE_BUILD at build time.
  output: process.env.STANDALONE_BUILD ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
