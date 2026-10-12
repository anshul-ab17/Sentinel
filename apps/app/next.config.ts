import path from "node:path";

import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    const api = process.env.API_SERVER_URL ?? "http://127.0.0.1:4000";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/v1/:path*", destination: `${api}/v1/:path*` },
    ];
  },
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
};
export default config;
