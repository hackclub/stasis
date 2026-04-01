'use client';

import { useEffect, useState, useRef } from "react";
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { PlatformNoiseOverlay } from '../components/PlatformNoiseOverlay';
import { UserMenu } from '../components/UserMenu';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useRoles, Role } from "@/lib/hooks/useRoles";
import { TamagotchiCompanion } from '../components/tamagotchi/TamagotchiCompanion';
import { ImpersonationBanner } from '../components/ImpersonationBanner';



export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, isPending } = useSession();
  const { hasRole } = useRoles();
  const pathname = usePathname();
  const router = useRouter();

  const [isFraudSuspended, setIsFraudSuspended] = useState(false);
  const [inventoryEnabled, setInventoryEnabled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session) {
      localStorage.setItem('has_logged_in', 'true');
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetch('/api/user/fraud-status')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.fraudConvicted) setIsFraudSuspended(true);
        })
        .catch(() => {});
      fetch('/api/inventory/access')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.allowed || data?.isAdmin) setInventoryEnabled(true);
        })
        .catch(() => {});
    }
  }, [session]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [mobileMenuOpen]);

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

  const getMobileMenuClass = (tabPath: string) => {
    const isActive = tabPath === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(tabPath);

    return `block px-4 py-3 text-sm uppercase tracking-wider transition-colors ${
      isActive
        ? 'text-orange-500 bg-orange-500/10 font-bold'
        : 'text-brown-800 hover:bg-cream-200'
    }`;
  };

  const tabs = [
    { path: '/dashboard', label: 'Projects' },
    { path: '/dashboard/discover', label: 'Discover' },
    { path: '/dashboard/shop', label: 'Shop' },
    { path: '/starter-projects', label: 'Starter Projects' },
    { path: '/docs', label: 'Guidelines & FAQ' },
  ];

  const activeTab = tabs.find(t =>
    t.path === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(t.path)
  );

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono">
        <div className="loader" />
      </div>
    );
  }

  if (!session && pathname.startsWith('/docs')) {
    router.replace('/docs');
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
        <PlatformNoiseOverlay />
      </>
    );
  }

  return (
    <>
      <ImpersonationBanner />
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

        {/* Tabs - Desktop */}
        <div className="border-b border-cream-400 hidden sm:block">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex flex-wrap">
              {tabs.map((tab) => (
                <Link key={tab.path} href={tab.path} className={getTabClass(tab.path)}>
                  {tab.label}
                </Link>
              ))}
              {inventoryEnabled && (
                <Link href="/inventory" className="ml-auto px-4 md:px-6 py-3 text-sm uppercase tracking-wider transition-colors border-b-2 -mb-[2px] border-transparent text-orange-500 hover:border-orange-500">
                  Inventory &rarr;
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation - Waffle Menu */}
        <div className="border-b border-cream-400 sm:hidden" ref={menuRef}>
          <div className="px-4 flex items-center justify-between">
            <span className="text-sm uppercase tracking-wider text-orange-500 font-bold py-3">
              {activeTab?.label || 'Menu'}
            </span>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-brown-800 hover:text-orange-500 transition-colors cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                {mobileMenuOpen ? (
                  <path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4L10.6 12l-4.9 4.9a1 1 0 1 0 1.4 1.4L12 13.4l4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z" />
                ) : (
                  <>
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  </>
                )}
              </svg>
            </button>
          </div>
          {mobileMenuOpen && (
            <div className="border-t border-cream-400 bg-cream-100">
              {tabs.map((tab) => (
                <Link key={tab.path} href={tab.path} className={getMobileMenuClass(tab.path)}>
                  {tab.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {isFraudSuspended && (
            <div className="mb-8 bg-red-100 border-4 border-red-500 p-8 text-center">
              <div className="text-4xl mb-4">⚠️</div>
              <h2 className="text-red-800 text-2xl uppercase tracking-wider font-bold mb-4">
                Account Suspended
              </h2>
              <p className="text-red-700 text-lg mb-2">
                Your account has been suspended for suspected fraud.
              </p>
              <p className="text-red-700 text-sm">
                Please ask in{' '}
                <a href="https://hackclub.slack.com/archives/C08PY70K12V" className="underline font-medium hover:text-red-900">#stasis-support</a>
                {' '}or email{' '}
                <a href="mailto:stasis@hackclub.com" className="underline font-medium hover:text-red-900">stasis@hackclub.com</a>
              </p>
            </div>
          )}
          {children}
        </div>
      </div>

      <PlatformNoiseOverlay />

      {/* Tamagotchi Streak Challenge — bottom-center persistent companion */}
      {session && <TamagotchiCompanion />}
    </>
  );
}
