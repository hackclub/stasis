'use client';

import { authClient, useSession, signOut } from "@/lib/auth-client";
import { usePathname } from 'next/navigation';
import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NoiseOverlay } from '../components/NoiseOverlay';
import { UserMenu } from '../components/UserMenu';
import { useRoles, Role } from "@/lib/hooks/useRoles";
import { InventoryAccessProvider, type AccessInfo } from './InventoryAccessContext';
import { InventoryWelcomeModal } from '../components/inventory/InventoryWelcomeModal';

type InitialUser = {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  slackDisplayName?: string | null;
};

export function InventoryLayoutClient({
  children,
  initialAccess,
  initialUser,
  inventoryEnabled,
}: Readonly<{
  children: React.ReactNode;
  initialAccess: AccessInfo | null;
  initialUser: InitialUser | null;
  inventoryEnabled: boolean;
}>) {
  const { data: session, isPending } = useSession();
  const { hasRole } = useRoles();
  const pathname = usePathname();
  const [access, setAccess] = useState<AccessInfo | null>(initialAccess);
  const [accessLoading, setAccessLoading] = useState(Boolean(initialUser) && !initialAccess);
  const sessionUser = session?.user as InitialUser | undefined;
  const currentUser = sessionUser ?? initialUser;

  useEffect(() => {
    if (!currentUser) {
      setAccess(null);
      setAccessLoading(false);
      return;
    }

    if (initialAccess) {
      setAccess(initialAccess);
      setAccessLoading(false);
      return;
    }

    setAccessLoading(true);
    fetch('/api/inventory/access')
      .then(res => res.json())
      .then((data: AccessInfo) => {
        setAccess(data);
        setAccessLoading(false);
      })
      .catch(() => {
        setAccess({ allowed: false, reason: 'Failed to check access.', isAdmin: false });
        setAccessLoading(false);
      });
  }, [currentUser, initialAccess]);

  const getTabClass = (tabPath: string) => {
    const isActive = tabPath === '/inventory'
      ? pathname === '/inventory'
      : pathname.startsWith(tabPath);

    return `px-4 md:px-6 py-3 text-sm uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
      isActive
        ? 'text-orange-500 border-orange-500 font-bold'
        : 'text-brown-800 border-transparent hover:text-brown-800'
    }`;
  };

  if (isPending && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono">
        <div className="loader" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <Link href="/" className="inline-block hover:opacity-80 transition-opacity mb-8">
              <img src="/stasis-logo.svg" alt="Stasis" className="h-12 w-auto mx-auto" />
            </Link>
            <h1 className="text-brown-800 text-2xl md:text-3xl font-bold uppercase tracking-wide mb-4">Log in to inventory</h1>
            <p className="text-brown-800/70 mb-6">
              Inventory is open. Log in with Hack Club to browse parts, tools, and print requests.
            </p>
            <button
              onClick={() => authClient.signIn.oauth2({ providerId: 'hca', callbackURL: pathname })}
              className="bg-orange-500 hover:bg-orange-600 text-cream-50 px-6 py-3 text-sm uppercase tracking-wider transition-colors"
            >
              Log in with Hack Club
            </button>
          </div>
        </div>
        <NoiseOverlay />
      </>
    );
  }

  if (accessLoading) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono">
          <div className="loader" />
        </div>
        <NoiseOverlay />
      </>
    );
  }

  if (!access?.allowed && !access?.isAdmin) {
    notFound();
  }

  return (
    <>
      <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">
        <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <img src="/stasis-logo.svg" alt="Stasis" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <UserMenu
              userId={currentUser.id}
              name={currentUser.slackDisplayName || currentUser.name || currentUser.email || ''}
              email={currentUser.email}
              image={currentUser.image}
              isAdmin={hasRole(Role.ADMIN) || Boolean(access?.isAdmin)}
              isReviewer={hasRole(Role.REVIEWER)}
              isAuditor={hasRole(Role.AUDITOR)}
              onSignOut={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/' } } })}
            />
          </div>
        </div>

        <div className="border-b border-cream-400">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-wrap">
              <Link href="/inventory/dashboard" className={getTabClass('/inventory/dashboard')}>
                Home
              </Link>
              <Link href="/inventory" className={getTabClass('/inventory')}>
                Browse
              </Link>
              {access?.isAdmin && (
                <Link href="/inventory/admin" className={getTabClass('/inventory/admin')}>
                  Admin
                </Link>
              )}
              <Link href="/dashboard" className="ml-auto px-4 md:px-6 py-3 text-sm uppercase tracking-wider text-brown-800/50 hover:text-brown-800 transition-colors border-b-2 -mb-[2px] border-transparent">
                &larr; Dashboard
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <InventoryAccessProvider value={access!}>
            {children}
          </InventoryAccessProvider>
        </div>

        <div className="text-center py-8 text-xs md:text-sm uppercase tracking-wider text-brown-800/60">
          <div>
            stasis inventory system made by <a href="https://natey.me" target="_blank" rel="noopener noreferrer" className="underline hover:text-brown-800 transition-colors">@nty</a> :)
          </div>
          <div className="mt-2">
            3d printer UI/UX inspired by <a href="https://hackclub.enterprise.slack.com/team/U075KPSPBQA" target="_blank" rel="noopener noreferrer" className="underline hover:text-brown-800 transition-colors">@petercrossen</a>
          </div>
        </div>
      </div>

      {inventoryEnabled && <InventoryWelcomeModal />}
      <NoiseOverlay />
    </>
  );
}
