"use client";

import { useSession, signIn, signOut, linkOAuth2 } from "@/lib/auth-client";
import Link from "next/link";

export default function Dashboard() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
      <div className="bg-cream-900 border-2 border-cream-600 p-8 max-w-md w-full mx-4">
        {session ? (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl uppercase tracking-wide text-brand-500 mb-2">
                Dashboard
              </h1>
              <p className="text-cream-500 text-sm">
                Signed in as {session.user.email}
              </p>
              {session.user.name && (
                <p className="text-cream-100 mt-1">{session.user.name}</p>
              )}
            </div>
            <Link
              href="/dashboard/projects"
              className="block w-full bg-brand-500 hover:bg-brand-400 px-6 py-3 text-lg uppercase tracking-wider text-brand-900 transition-colors cursor-pointer text-center"
            >
              My Projects
            </Link>
            <button
              onClick={() =>
                linkOAuth2({
                  providerId: "hackatime",
                  callbackURL: "/dashboard",
                })
              }
              className="w-full bg-cream-850 hover:bg-cream-800 px-6 py-3 text-lg uppercase tracking-wider text-cream-100 transition-colors cursor-pointer"
            >
              Link Hackatime
            </button>
            <button
              onClick={() => signOut()}
              className="w-full bg-cream-600 hover:bg-cream-500 px-6 py-3 text-lg uppercase tracking-wider text-cream-950 transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl uppercase tracking-wide text-brand-500 mb-2">
                Dashboard
              </h1>
              <p className="text-cream-500 text-sm">
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
              className="w-full bg-brand-500 hover:bg-brand-400 px-6 py-3 text-lg uppercase tracking-wider text-brand-900 transition-colors cursor-pointer"
            >
              Sign In with Hack Club
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
