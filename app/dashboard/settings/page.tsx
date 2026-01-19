'use client';

import { useSession, signOut, linkOAuth2 } from "@/lib/auth-client";

export default function SettingsPage() {
  const { data: session } = useSession();

  if (!session) {
    return null;
  }

  return (
    <div className="max-w-xl">
      <div className="bg-cream-900 border-2 border-cream-600 p-6 space-y-6">
        <div>
          <h2 className="text-brand-500 text-xl uppercase mb-4">Account</h2>
          <div className="space-y-3">
            <div>
              <p className="text-cream-300 text-xs uppercase">Email</p>
              <p className="text-cream-100">{session.user.email}</p>
            </div>
            {session.user.name && (
              <div>
                <p className="text-cream-300 text-xs uppercase">Name</p>
                <p className="text-cream-100">{session.user.name}</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-cream-600 pt-6">
          <h2 className="text-brand-500 text-xl uppercase mb-4">Integrations</h2>
          <div className="space-y-3">
            <button
              onClick={() =>
                linkOAuth2({
                  providerId: "github",
                  callbackURL: "/dashboard/settings",
                })
              }
              className="w-full bg-cream-850 hover:bg-cream-800 px-6 py-3 text-lg uppercase tracking-wider text-cream-100 transition-colors cursor-pointer flex items-center justify-center gap-3"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Link GitHub
            </button>
            <p className="text-cream-300 text-xs">Required to save journal entries to your project repositories</p>
            
            <button
              onClick={() =>
                linkOAuth2({
                  providerId: "hackatime",
                  callbackURL: "/dashboard/settings",
                })
              }
              className="w-full bg-cream-850 hover:bg-cream-800 px-6 py-3 text-lg uppercase tracking-wider text-cream-100 transition-colors cursor-pointer"
            >
              Link Hackatime
            </button>
          </div>
        </div>

        <div className="border-t border-cream-600 pt-6">
          <h2 className="text-brand-500 text-xl uppercase mb-4">Session</h2>
          <button
            onClick={() => signOut()}
            className="w-full bg-red-600/20 hover:bg-red-600/30 border-2 border-red-600/50 px-6 py-3 text-lg uppercase tracking-wider text-red-500 transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
