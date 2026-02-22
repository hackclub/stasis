import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { genericOAuth } from "better-auth/plugins";
import prisma from "./prisma";
import { ensureRSVPExists } from "./airtable";
import { getSlackProfilePicture, getSlackDisplayName } from "./slack";
import { encryptPII } from "./pii";
import { assignSidekick } from "./sidekick";

const hcaScopes = ["openid", "profile", "email", "slack_id", "verification_status"];
if (process.env.PULL_HCA_PII === "true") {
  hcaScopes.push("address", "birthday");
}

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
      slackDisplayName: {
        type: "string",
        required: false,
      },
      verificationStatus: {
        type: "string",
        required: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (user.email) {
            try {
              await ensureRSVPExists(user.email, user.name || undefined);
            } catch (error) {
              console.error('Failed to ensure RSVP exists:', error);
            }
          }
          // Fetch Slack profile picture and display name if user has slackId
          const slackId = user.slackId as string | undefined;
          if (slackId) {
            const updates: Record<string, string> = {};
            try {
              if (!user.image) {
                const slackImage = await getSlackProfilePicture(slackId);
                if (slackImage) updates.image = slackImage;
              }
              const displayName = await getSlackDisplayName(slackId);
              if (displayName) updates.slackDisplayName = displayName;

              if (Object.keys(updates).length > 0) {
                await prisma.user.update({
                  where: { id: user.id },
                  data: updates,
                });
              }
            } catch (error) {
              console.error('Failed to fetch Slack profile data:', error);
            }
          }
          // Auto-assign a sidekick mentor
          try {
            await assignSidekick(user.id);
          } catch (error) {
            console.error('Failed to assign sidekick:', error);
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          // Refresh Slack display name in the background on each login
          const userId = session.userId;
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { slackId: true },
          });
          if (user?.slackId) {
            getSlackDisplayName(user.slackId).then(async (displayName) => {
              if (displayName) {
                await prisma.user.update({
                  where: { id: userId },
                  data: { slackDisplayName: displayName },
                }).catch((err) => console.error('Failed to update Slack display name:', err));
              }
            }).catch((err) => console.error('Failed to fetch Slack display name:', err));
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
          scopes: hcaScopes,
          authorizationUrlParams: (ctx): Record<string, string> => {
            if (!ctx.request) return {};
            const cookieHeader = ctx.request.headers.get('cookie') || '';
            const cookies = Object.fromEntries(
              cookieHeader.split('; ').map(c => {
                const [key, ...val] = c.split('=');
                return [key, val.join('=')];
              })
            );
            const loginHint = cookies['rsvp_login_hint'];
            return loginHint ? { login_hint: decodeURIComponent(loginHint) } : {};
          },
          mapProfileToUser: (profile) => {
            const user: Record<string, unknown> = {
              email: profile.email,
              name: profile.name,
              image: profile.picture,
              slackId: profile.slack_id,
              verificationStatus: profile.verification_status,
            };

            if (process.env.PULL_HCA_PII === "true") {
              const addr = profile.address;
              if (addr) {
                if (addr.street_address) user.encryptedAddressStreet = encryptPII(addr.street_address);
                if (addr.locality) user.encryptedAddressCity = encryptPII(addr.locality);
                if (addr.region) user.encryptedAddressState = encryptPII(addr.region);
                if (addr.postal_code) user.encryptedAddressZip = encryptPII(addr.postal_code);
                if (addr.country) user.encryptedAddressCountry = encryptPII(addr.country);
              }
              if (profile.birthday) {
                user.encryptedBirthday = encryptPII(profile.birthday);
              }
            }

            return user;
          },
        },
        {
          providerId: "github",
          authorizationUrl: "https://github.com/login/oauth/authorize",
          tokenUrl: "https://github.com/login/oauth/access_token",
          userInfoUrl: "https://api.github.com/user",
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
          scopes: ["repo", "user:email"],
          getUserInfo: async ({ accessToken }) => {
            const response = await fetch("https://api.github.com/user", {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github+json",
              },
            });
            const data = await response.json();
            return {
              id: String(data.id),
              email: data.email,
              name: data.name || data.login,
              emailVerified: !!data.email,
            };
          },
        },
      ],
    }),
  ],
});
