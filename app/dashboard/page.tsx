"use client";

import { useSession, signIn, signOut, linkOAuth2 } from "@/lib/auth-client";

export default function Dashboard() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100 font-mono">
        <p className="text-cream-800">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-100 font-mono">
      <div className="bg-cream-200 border border-cream-800/20 p-8 max-w-md w-full mx-4">
        {session ? (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl uppercase tracking-wide text-cream-800 mb-2">
                Dashboard
              </h1>
              <p className="text-cream-800/70 text-sm">
                Signed in as {session.user.email}
              </p>
              {session.user.name && (
                <p className="text-cream-800 mt-1">{session.user.name}</p>
              )}
            </div>
            <button
              onClick={() =>
                linkOAuth2({
                  providerId: "hackatime",
                  callbackURL: "/dashboard",
                })
              }
              className="w-full bg-cream-800 hover:bg-cream-900 px-6 py-3 text-lg uppercase tracking-wider text-cream-100 transition-colors cursor-pointer"
            >
              Link Hackatime
            </button>
            <button
              onClick={() => signOut()}
              className="w-full bg-brand-500 hover:bg-brand-600 px-6 py-3 text-lg uppercase tracking-wider text-brand-900 transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl uppercase tracking-wide text-cream-800 mb-2">
                Dashboard
              </h1>
              <p className="text-cream-800/70 text-sm">
                Sign in to continue
              </p>
            </div>
            <button
              onClick={() =>
                signIn.oauth2({
                  providerId: "hca",
                  callbackURL: "/dashboard",
                })
              }
              className="w-full bg-brand-500 hover:bg-brand-600 px-6 py-3 text-lg uppercase tracking-wider text-brand-900 transition-colors cursor-pointer"
            >
              Sign In with Hack Club
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
