'use client';

import { authClient } from '@/lib/auth-client';

export function LoginButton({ className }: Readonly<{ className?: string }>) {
  async function handleLogin() {
    await authClient.signIn.oauth2({
      providerId: 'hca',
      callbackURL: '/dashboard',
    });
  }

  return (
    <button
      onClick={handleLogin}
      className={className ?? "text-lg bg-orange-500/20 border border-orange-500 px-3 py-1 hover:bg-orange-500/30 cursor-pointer transition-colors"}
    >
      Log In
    </button>
  );
}
