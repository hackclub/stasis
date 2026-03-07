import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});

export const { signIn, signOut, useSession } = authClient;
export const { link: linkOAuth2 } = authClient.oauth2;
