'use client';

import { useSession, signOut, linkOAuth2 } from "@/lib/auth-client";

export default function SettingsPage() {
  const { data: session } = useSession();

  if (!session) {
    return null;
  }

  return (
    <div className="max-w-xl mx-auto">
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
