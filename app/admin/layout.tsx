'use client';

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

import Link from 'next/link';
import { useRoles, Permission } from '@/lib/hooks/useRoles';

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { roles, isLoading: rolesLoading, hasPermission } = useRoles();
  
  const isLoading = isPending || rolesLoading;
  const isAuthorized = !isLoading && session && roles.length > 0;
  const shouldRedirect = !isLoading && (!session || roles.length === 0);

  useEffect(() => {
    if (shouldRedirect) {
      router.push('/dashboard');
    }
  }, [shouldRedirect, router]);

  const getTabClass = (tabPath: string) => {
    const isActive = tabPath === '/admin'
      ? pathname === '/admin'
      : tabPath === '/admin/audit'
        ? pathname === '/admin/audit'
        : pathname.startsWith(tabPath);

    return `px-3 sm:px-6 py-3 text-sm uppercase tracking-wider whitespace-nowrap transition-colors border-b-2 -mb-[2px] ${
      isActive
        ? 'text-orange-500 border-orange-500'
        : 'text-cream-200 border-transparent hover:text-cream-50'
    }`;
  };

  if (isLoading || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brown-900 font-mono">
        <div className="loader" />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-brown-900 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-brown-800">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-cream-100 hover:text-orange-500 transition-colors">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </Link>
            <h1 className="text-orange-500 text-xl uppercase tracking-wide">Admin</h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            <div className="flex items-center gap-2">
              <img
                src={session?.user.image || '/default_slack.png'}
                alt=""
                className="w-8 h-8 border-2 border-orange-500"
              />
              <span className="text-cream-100 text-sm hidden sm:block">
                {session?.user.name || session?.user.email}
              </span>
            </div>
            <button
              onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/' } } })}
              className="text-cream-200 hover:text-orange-500 text-sm uppercase transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-brown-800">
          <div className="px-4">
            <div className="flex overflow-x-auto gap-0">
              <Link href="/admin/review" className={getTabClass('/admin/review')}>
                Review Queue
              </Link>
              {(hasPermission(Permission.REVIEW_PROJECTS) || hasPermission(Permission.VIEW_AUDIT_REVIEWS)) && (
                <Link href="/admin/audit-reviews" className={getTabClass('/admin/audit-reviews')}>
                  Audit Reviews
                </Link>
              )}
              <Link href="/admin/projects" className={getTabClass('/admin/projects')}>
                Projects
              </Link>
              {hasPermission(Permission.MANAGE_USERS) && (
                <Link href="/admin/users" className={getTabClass('/admin/users')}>
                  Users
                </Link>
              )}
              {hasPermission(Permission.MANAGE_USERS) && (
                <Link href="/admin/sidekicks" className={getTabClass('/admin/sidekicks')}>
                  Sidekicks
                </Link>
              )}
              {hasPermission(Permission.MANAGE_USERS) && (
                <Link href="/admin/rsvps" className={getTabClass('/admin/rsvps')}>
                  RSVPs
                </Link>
              )}
              {hasPermission(Permission.VIEW_AUDIT_LOG) && (
                <Link href="/admin/audit" className={getTabClass('/admin/audit')}>
                  Audit
                </Link>
              )}
              {hasPermission(Permission.MANAGE_CURRENCY) && (
                <Link href="/admin/currency" className={getTabClass('/admin/currency')}>
                  Bits Ledger
                </Link>
              )}
              {hasPermission(Permission.MANAGE_CURRENCY) && (
                <Link href="/admin/shop" className={getTabClass('/admin/shop')}>
                  Shop Items
                </Link>
              )}
              {hasPermission(Permission.MANAGE_CURRENCY) && (
                <Link href="/admin/purchases" className={getTabClass('/admin/purchases')}>
                  Purchases
                </Link>
              )}
              {hasPermission(Permission.MANAGE_CURRENCY) && (
                <Link href="/admin/reviewer-payments" className={getTabClass('/admin/reviewer-payments')}>
                  Reviewer Pay
                </Link>
              )}
              {hasPermission(Permission.MANAGE_USERS) && (
                <Link href="/admin/stats" className={getTabClass('/admin/stats')}>
                  Stats
                </Link>
              )}
              {hasPermission(Permission.MANAGE_USERS) && (
                <Link href="/admin/events" className={getTabClass('/admin/events')}>
                  Events
                </Link>
              )}
              {hasPermission(Permission.MANAGE_USERS) && (
                <Link href="/admin/slack" className={getTabClass('/admin/slack')}>
                  Slack
                </Link>
              )}
              <Link href="/inventory/admin" className={getTabClass('/inventory/admin')}>
                Inventory
              </Link>
            </div>
          </div>
        </div>

        <div className="px-6 py-8">
          {children}
        </div>
      </div>

    </>
  );
}
