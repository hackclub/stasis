import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'hc-cdn.hel1.your-objectstorage.com',
      },
    ],
  },
};

export default nextConfig;
