'use client';

import { useSession } from "@/lib/auth-client";
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AccessInfo {
  allowed: boolean;
  reason?: string;
  isAdmin: boolean;
  teamId?: string;
  teamName?: string;
}

export default function InventoryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    fetch('/api/inventory/access')
      .then(res => res.json())
      .then(data => {
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

    return `px-6 py-3 text-sm uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
      isActive
        ? 'text-orange-500 border-orange-500'
        : 'text-brown-800 border-transparent hover:text-orange-500'
    }`;
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 font-mono">
        <div className="loader" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 font-mono">
        <div className="text-center max-w-md px-4">
          <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Sign In Required</h2>
          <p className="text-brown-800/70 mb-6">You must be logged in to access inventory.</p>
          <Link
            href="/dashboard"
            className="inline-block px-6 py-2 bg-orange-500 text-cream-50 uppercase text-sm tracking-wider hover:bg-orange-600 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 font-mono">
        <div className="loader" />
      </div>
    );
  }

  if (!access?.allowed && !access?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-50 font-mono">
        <div className="text-center max-w-md px-4">
          <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Access Denied</h2>
          <p className="text-brown-800/70">{access?.reason || 'You do not have access to inventory.'}</p>
          <Link
            href="/dashboard"
            className="inline-block mt-6 px-6 py-2 border-2 border-brown-800 text-brown-800 uppercase text-sm tracking-wider hover:bg-brown-800 hover:text-cream-50 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50 font-mono">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-cream-400">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-brown-800 hover:text-orange-500 transition-colors">
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
          <h1 className="text-orange-500 text-xl uppercase tracking-wide">Inventory</h1>
          {access?.teamName && (
            <span className="text-brown-800/60 text-sm">/ {access.teamName}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b-2 border-brown-800">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-0">
            <Link href="/inventory/dashboard" className={getTabClass('/inventory/dashboard')}>
              Dashboard
            </Link>
            <Link href="/inventory" className={getTabClass('/inventory')}>
              Browse Parts
            </Link>
            <Link href="/inventory/tools" className={getTabClass('/inventory/tools')}>
              Tools
            </Link>
            <Link href="/inventory/team" className={getTabClass('/inventory/team')}>
              Team
            </Link>
            {access?.isAdmin && (
              <Link href="/inventory/admin" className={getTabClass('/inventory/admin')}>
                Admin
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  );
}
