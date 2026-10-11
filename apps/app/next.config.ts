import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_SERVER_URL ?? "http://127.0.0.1:4000"}/api/:path*` }];
  },
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
};
export default config;
