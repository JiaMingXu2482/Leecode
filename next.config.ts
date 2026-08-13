import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 侧边栏的「更新于」日期。以前是手写常量，每次发版都得记得改，结果一直停在
  // 2026-07-08。改成构建时注入，构建一次就自动是当天，不会再过期。
  env: {
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 10),
  },
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
