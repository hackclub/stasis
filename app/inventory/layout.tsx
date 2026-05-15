'use client';

import { useSession, signOut } from "@/lib/auth-client";
import { usePathname } from 'next/navigation';
import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NoiseOverlay } from '../components/NoiseOverlay';
import { UserMenu } from '../components/UserMenu';
import { useRoles, Role } from "@/lib/hooks/useRoles";
import { InventoryAccessProvider, type AccessInfo } from './InventoryAccessContext';

export default function InventoryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, isPending } = useSession();
  const { hasRole } = useRoles();
  const pathname = usePathname();
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
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
  }, [session]);

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

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono">
        <div className="loader" />
      </div>
    );
  }

  if (!session) {
    notFound();
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
        {/* Header */}
        <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <img src="/stasis-logo.svg" alt="Stasis" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <UserMenu
              userId={session.user.id}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              name={(session.user as any).slackDisplayName || session.user.name || session.user.email || ''}
              email={session.user.email}
              image={session.user.image}
              isAdmin={hasRole(Role.ADMIN)}
              isReviewer={hasRole(Role.REVIEWER)}
              isAuditor={hasRole(Role.AUDITOR)}
              onSignOut={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/' } } })}
            />
          </div>
        </div>

        {/* Tabs */}
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

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          <InventoryAccessProvider value={access!}>
            {children}
          </InventoryAccessProvider>
        </div>
      </div>

      <NoiseOverlay />
    </>
  );
}
