'use client';

import { authClient } from '@/lib/auth-client';

export function LoginButton() {
  async function handleLogin() {
    await authClient.signIn.oauth2({
      providerId: 'hca',
      callbackURL: '/dashboard',
    });
  }

  return (
    <button
      onClick={handleLogin}
      className="underline hover:text-brand-500 cursor-pointer"
    >
      log in
    </button>
  );
}
