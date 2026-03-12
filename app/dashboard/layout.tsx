'use client';

import { useEffect } from "react";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { NoiseOverlay } from '../components/NoiseOverlay';
import { UserMenu } from '../components/UserMenu';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useRoles, Role } from "@/lib/hooks/useRoles";



export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, isPending } = useSession();
  const { hasRole } = useRoles();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      localStorage.setItem('has_logged_in', 'true');
    }
  }, [session]);



  const getTabClass = (tabPath: string) => {
    const isActive = tabPath === '/dashboard' 
      ? pathname === '/dashboard'
      : pathname.startsWith(tabPath);
    
    return `px-4 md:px-6 py-3 text-sm uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
      isActive
        ? 'text-orange-500 border-orange-500 font-bold'
        : 'text-brown-800 border-transparent hover:text-brown-800'
    }`;
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono">
        <div className="loader" />
      </div>
    );
  }

  if (!session && pathname.startsWith('/dashboard/help')) {
    router.replace('/help');
    return null;
  }

  if (!session) {
    return (
      <>
        <div className="relative min-h-screen flex items-center justify-center bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono">
          <Image src="/stasis-logo.svg" alt="Hack Club Stasis" width={120} height={40} className="absolute top-6 left-6 h-10 w-auto" />
          <div className="bg-cream-200 border-2 border-cream-400 p-8 max-w-md w-full mx-4">
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-2xl uppercase tracking-wide text-orange-500 mb-2">
                  You need to be logged in to view this page
                </h1>
              </div>
              <button
                onClick={() =>
                  signIn.oauth2({
                    providerId: "hca",
                    callbackURL: "/dashboard",
                  })
                }
                className="w-full bg-orange-500 hover:bg-orange-400 px-6 py-3 text-lg uppercase tracking-wider text-white font-medium transition-colors cursor-pointer"
              >
                Sign In with Hack Club
              </button>
            </div>
          </div>
        </div>
        <NoiseOverlay />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">

        {/* Header */}
        <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <img src="/stasis-logo.svg" alt="Stasis" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <UserMenu
              userId={session.user.id}
              name={(session.user as any).slackDisplayName || session.user.name || session.user.email || ''}
              email={session.user.email}
              image={session.user.image}
              isAdmin={hasRole(Role.ADMIN)}
              isReviewer={hasRole(Role.REVIEWER)}
              onSignOut={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/' } } })}
            />
            {hasRole(Role.SIDEKICK) && (
              <Link
                href="/sidekick"
                className="text-cream-700 hover:text-brand-500 text-sm uppercase transition-colors flex items-center"
              >
                Sidekick
              </Link>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-cream-400">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-wrap">
              <Link href="/dashboard" className={getTabClass('/dashboard')}>
                Projects
              </Link>
              <Link href="/dashboard/discover" className={getTabClass('/dashboard/discover')}>
                Discover
              </Link>
              <Link href="/dashboard/shop" className={getTabClass('/dashboard/shop')}>
                Shop
              </Link>
              <Link href="/starter-projects" className={getTabClass('/starter-projects')}>
                Starter Projects
              </Link>
              <Link href="/dashboard/help" className={getTabClass('/dashboard/help')}>
                Guidelines & FAQ
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </div>
      </div>

      <NoiseOverlay />
    </>
  );
}
