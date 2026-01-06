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
      ],
    }),
  ],
});
