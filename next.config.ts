import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache: visited pages stay for 5 min (dynamic) and nav links
    // use prefetch={true}, whose entries live in the static bucket — so tab
    // switching is instant. Freshness after mutations is guaranteed by the
    // workbench, which re-fetches each page on first arrival after a mutation.
    staleTimes: {
      dynamic: 300,
      static: 300,
    },
  },
};

export default nextConfig;
