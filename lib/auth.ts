import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { genericOAuth } from "better-auth/plugins";
import prisma from "./prisma";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      slackId: {
        type: "string",
        required: false,
      },
      verificationStatus: {
        type: "string",
        required: false,
      },
      hackatimeUserId: {
        type: "string",
        required: false,
      },
    },
  },
  databaseHooks: {
    account: {
      create: {
        after: async (account) => {
          if (account.providerId === "hackatime") {
            await prisma.user.update({
              where: { id: account.userId },
              data: { hackatimeUserId: account.accountId },
            });
          }
        },
      },
    },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "hca",
          discoveryUrl: "https://auth.hackclub.com/.well-known/openid-configuration",
          clientId: process.env.HCA_CLIENT_ID!,
          clientSecret: process.env.HCA_CLIENT_SECRET!,
          scopes: ["openid", "profile", "email", "slack_id", "verification_status"],
          mapProfileToUser: (profile) => {
            return {
              email: profile.email,
              name: profile.name,
              image: profile.picture,
              slackId: profile.slack_id,
              verificationStatus: profile.verification_status,
            };
          },
        },
        {
          providerId: "hackatime",
          authorizationUrl: "https://hackatime.hackclub.com/oauth/authorize",
          tokenUrl: "https://hackatime.hackclub.com/oauth/token",
          userInfoUrl: "https://hackatime.hackclub.com/api/v1/authenticated/me",
          clientId: process.env.HACKATIME_CLIENT_ID!,
          clientSecret: process.env.HACKATIME_CLIENT_SECRET!,
          scopes: ["profile"],
          pkce: true,
          getUserInfo: async ({ accessToken }) => {
            const response = await fetch(
              "https://hackatime.hackclub.com/api/v1/authenticated/me",
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );
            const data = await response.json();
            return {
              id: String(data.id),
              email: data.emails?.[0],
              name: data.github_username || data.slack_id,
              emailVerified: false,
            };
          },
        },
      ],
    }),
  ],
});
