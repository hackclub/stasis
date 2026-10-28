'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signIn } from '@/lib/auth-client';

export function ExploreHeader() {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();

  return (
    <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
      <div className="flex items-center gap-4">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <img src="/stasis-logo.svg" alt="Stasis" className="h-10 w-auto" />
        </Link>
        <Link
          href="/explore"
          className="text-sm uppercase tracking-wider text-brown-800 hover:text-orange-500 transition-colors"
        >
          Explore
        </Link>
      </div>
      {!isPending && (session ? (
        <Link
          href="/dashboard"
          className="bg-orange-500 hover:bg-orange-400 px-4 py-1.5 text-sm uppercase tracking-wider text-white font-medium transition-colors"
        >
          Dashboard
        </Link>
      ) : (
        <button
          onClick={() =>
            signIn.oauth2({
              providerId: "hca",
              callbackURL: pathname,
            })
          }
          className="bg-orange-500 hover:bg-orange-400 px-4 py-1.5 text-sm uppercase tracking-wider text-white font-medium transition-colors cursor-pointer"
        >
          Sign In
        </button>
      ))}
    </div>
  );
}
