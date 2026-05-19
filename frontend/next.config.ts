import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@hestia/shared'],
  turbopack: {},
};

export default nextConfig;
