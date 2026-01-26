import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'stasis-staging.hackclub-assets.com',
      },
      {
        protocol: 'https',
        hostname: 'stasis.hackclub-assets.com',
      },
    ],
  },
};

export default nextConfig;
