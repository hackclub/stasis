import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { genericOAuth } from "better-auth/plugins";
import prisma from "./prisma";
import { ensureRSVPExists } from "./airtable";
import { getSlackProfilePicture, getSlackDisplayName, inviteToSlackChannels } from "./slack";
import { encryptPII } from "./pii";
import { assignSidekick } from "./sidekick";

const hcaScopes = ["openid", "profile", "email", "slack_id", "verification_status"];
if (process.env.PULL_HCA_PII === "true") {
  hcaScopes.push("address", "birthdate");
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
      encryptedAddressStreet: {
        type: "string",
        required: false,
      },
      encryptedAddressCity: {
        type: "string",
        required: false,
      },
      encryptedAddressState: {
        type: "string",
        required: false,
      },
      encryptedAddressZip: {
        type: "string",
        required: false,
      },
      encryptedAddressCountry: {
        type: "string",
        required: false,
      },
      encryptedBirthday: {
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
              const slackImage = await getSlackProfilePicture(slackId);
              if (slackImage && !user.image) {
                updates.image = slackImage;
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
          // Invite user to Slack channels
          if (slackId) {
            inviteToSlackChannels(slackId).catch((error) =>
              console.error('Failed to invite to Slack channels:', error)
            );
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
    session: {
      create: {
        after: async (session) => {
          const userId = session.userId;
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { slackId: true },
          });

          // Refresh Slack profile picture, display name, and channel invites on each login
          if (user?.slackId) {
            inviteToSlackChannels(user.slackId).catch((err) =>
              console.error('Failed to invite to Slack channels:', err)
            );
            Promise.all([
              getSlackProfilePicture(user.slackId),
              getSlackDisplayName(user.slackId),
            ]).then(async ([slackImage, displayName]) => {
              const updates: Record<string, string | null> = {};
              if (slackImage) updates.image = slackImage;
              if (displayName) updates.slackDisplayName = displayName;
              if (Object.keys(updates).length > 0) {
                await prisma.user.update({
                  where: { id: userId },
                  data: updates,
                });
              }
            }).catch((err) => console.error('Failed to refresh Slack profile:', err));
          }

          // Refresh HCA PII (address + birthday) on every login using the stored access token
          if (process.env.PULL_HCA_PII === 'true') {
            prisma.account.findFirst({
              where: { userId, providerId: 'hca' },
              select: { accessToken: true },
            }).then(async (account) => {
              if (!account?.accessToken) return;
              const resp = await fetch('https://auth.hackclub.com/userinfo', {
                headers: { Authorization: `Bearer ${account.accessToken}` },
              });
              if (!resp.ok) return;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const profile: any = await resp.json();
              const updates: Record<string, string> = {};
              const addr = profile.address;
              if (addr) {
                if (addr.street_address) updates.encryptedAddressStreet = encryptPII(addr.street_address);
                if (addr.locality) updates.encryptedAddressCity = encryptPII(addr.locality);
                if (addr.region) updates.encryptedAddressState = encryptPII(addr.region);
                if (addr.postal_code) updates.encryptedAddressZip = encryptPII(addr.postal_code);
                if (addr.country) updates.encryptedAddressCountry = encryptPII(addr.country);
              }
              if (profile.birthdate) updates.encryptedBirthday = encryptPII(profile.birthdate);
              if (Object.keys(updates).length > 0) {
                await prisma.user.update({ where: { id: userId }, data: updates });
              }
            }).catch((err) => console.error('Failed to refresh HCA PII:', err));
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
          overrideUserInfo: true,
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
              if (profile.birthdate) {
                user.encryptedBirthday = encryptPII(profile.birthdate);
              }
            }

            return user;
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
