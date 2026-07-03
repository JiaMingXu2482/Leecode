import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache: entries live for a whole session (1h) so navigation
    // never suspends into the loading boundary. Freshness is handled by the
    // workbench in the background: stale-on-arrival refresh, refresh + re-warm
    // on window focus, and per-page refresh after every mutation.
    staleTimes: {
      dynamic: 3600,
      static: 3600,
    },
  },
};

export default nextConfig;
