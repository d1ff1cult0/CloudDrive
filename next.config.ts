import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray lockfile in $HOME otherwise
  // makes Next infer the wrong root).
  turbopack: {
    root: __dirname,
  },
  // Standalone output for the production Docker image (Phase 9).
  output: "standalone",
};

export default nextConfig;
