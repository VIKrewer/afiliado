import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:3001";
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/r/:path*", destination: `${api}/r/:path*` },
    ];
  },
};

export default nextConfig;
