'use client';

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
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
      : pathname.startsWith(tabPath);
    
    return `px-6 py-3 text-sm uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
      isActive
        ? 'text-brand-500 border-brand-500'
        : 'text-cream-800 border-transparent hover:text-cream-900'
    }`;
  };

  if (isLoading || !isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono">
        <p className="text-cream-700">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-400">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-cream-700 hover:text-brand-500 transition-colors">
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
            <h1 className="text-brand-500 text-xl uppercase tracking-wide">Admin</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              {session?.user.image ? (
                <img 
                  src={session.user.image} 
                  alt="" 
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-cream-400 flex items-center justify-center">
                  <span className="text-cream-800 text-sm">
                    {(session?.user.name || session?.user.email)?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-cream-700 text-sm hidden sm:block">
                {session?.user.name || session?.user.email}
              </span>
            </div>
            <button
              onClick={() => signOut()}
              className="text-cream-700 hover:text-brand-500 text-sm uppercase transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-cream-400">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-0">
              <Link href="/admin" className={getTabClass('/admin')}>
                Projects
              </Link>
              {hasPermission(Permission.MANAGE_USERS) && (
                <Link href="/admin/users" className={getTabClass('/admin/users')}>
                  Users
                </Link>
              )}
              {hasPermission(Permission.VIEW_AUDIT_LOG) && (
                <Link href="/admin/audit" className={getTabClass('/admin/audit')}>
                  Audit
                </Link>
              )}
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
