import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Maps legacy URLs to the canonical Plan routes while preserving the request method and body.
  async rewrites() {
    return [
      { source: '/api/plans', destination: '/api/plans/calendar' },
      { source: '/api/check-list', destination: '/api/plans/task' },
      { source: '/api/plans/check-list', destination: '/api/plans/task' },
    ];
  },
  serverExternalPackages: ['pdfmake'],
  turbopack: { root: process.cwd() },
};

export default nextConfig;
