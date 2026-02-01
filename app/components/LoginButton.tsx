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
      className="text-lg bg-brand-500/20 border border-brand-500 px-3 py-1 hover:bg-brand-500/30 cursor-pointer transition-colors"
    >
      log in
    </button>
  );
}
