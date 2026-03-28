import { withSentryConfig } from '@sentry/nextjs';
import createMDX from '@next/mdx';
import type { NextConfig } from "next";

// Skip standalone output and Sentry build plugin for local builds (faster)
// Production builds in CI/Docker still get the full treatment
const isDeployBuild = !!(process.env.CI || process.env.DOCKER_BUILD);

const nextConfig: NextConfig = {
  ...(isDeployBuild && { output: "standalone" }),
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
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
      {
        protocol: 'https',
        hostname: '*.slack-edge.com',
      },
      {
        protocol: 'https',
        hostname: 'blueprint.hackclub.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.hackclub.com',
      },
      {
        protocol: 'https',
        hostname: 'user-cdn.hackclub-assets.com',
      },
      {
        protocol: 'https',
        hostname: 'files.catbox.moe',
      },
    ],
  },
};

const withMDX = createMDX({});

const config = withMDX(nextConfig);

export default isDeployBuild
  ? withSentryConfig(config, {
      org: "hack-club",
      project: "stasis",
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      webpack: {
        automaticVercelMonitors: true,
        treeshake: {
          removeDebugLogging: true,
        },
      },
    })
  : config;
