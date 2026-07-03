import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache: keep visited pages for 30s so switching tabs is
    // instant. Freshness after mutations is guaranteed by the workbench, which
    // marks a pending cross-view refresh and re-fetches on the next navigation.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
