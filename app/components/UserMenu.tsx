'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface UserMenuProps {
  userId: string;
  name: string;
  email?: string | null;
  image?: string | null;
  isAdmin?: boolean;
  onSignOut?: () => void;
}

export function UserMenu({ userId, name, email, image, isAdmin, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleReplayTutorial() {
    setOpen(false);
    // Set localStorage flag for cross-page navigation
    localStorage.setItem('stasis_replay_tutorial', '1');
    // Also dispatch an event for same-page trigger
    window.dispatchEvent(new CustomEvent('stasis:replay-tutorial'));
    router.push('/dashboard');
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => { setOpen(o => !o); setShowTooltip(false); }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
        aria-label="Open user menu"
      >
        {image ? (
          <img src={image} alt="" className="w-8 h-8" />
        ) : (
          <div className="w-8 h-8 bg-cream-400 flex items-center justify-center">
            <span className="text-brown-800 text-sm">{name?.[0]?.toUpperCase()}</span>
          </div>
        )}
        <span className="text-orange-500 font-bold text-sm hidden sm:block">{name}</span>
      </button>

      {/* Tooltip */}
      {showTooltip && !open && (
        <div className="absolute right-0 top-full mt-1 z-50 pointer-events-none">
          <div className="bg-brown-800 text-cream-100 text-xs px-2 py-1 whitespace-nowrap">
            Open user menu
          </div>
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-cream-100 border-2 border-cream-400 min-w-[180px]">
          {email && (
            <div className="px-4 py-2 text-sm text-cream-600 truncate max-w-[220px]">
              {email}
            </div>
          )}
          <div className="border-t border-cream-400" />
          <Link
            href={`/dashboard/profile/${userId}`}
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-brown-800 hover:bg-cream-200 hover:text-orange-500 uppercase tracking-wide transition-colors"
          >
            Profile
          </Link>
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-brown-800 hover:bg-cream-200 hover:text-orange-500 uppercase tracking-wide transition-colors"
          >
            Settings
          </Link>
          <button
            onClick={handleReplayTutorial}
            className="block w-full text-left px-4 py-2 text-sm text-brown-800 hover:bg-cream-200 hover:text-orange-500 uppercase tracking-wide transition-colors cursor-pointer"
          >
            Replay Tutorial
          </button>
          {isAdmin && (
            <>
              <div className="border-t border-cream-400" />
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="block px-4 py-2 text-sm text-orange-500 hover:bg-cream-200 uppercase tracking-wide transition-colors font-bold"
              >
                Admin Dashboard
              </Link>
            </>
          )}
          {onSignOut && (
            <>
              <div className="border-t border-cream-400" />
              <button
                onClick={() => { setOpen(false); onSignOut(); }}
                className="block w-full text-left px-4 py-2 text-sm text-brown-800 hover:bg-cream-200 hover:text-orange-500 uppercase tracking-wide transition-colors cursor-pointer"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
