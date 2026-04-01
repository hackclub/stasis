'use client';

import { useState, useEffect } from 'react';

interface ImpersonationInfo {
  userId: string;
  name: string;
  adminName: string;
}

export function ImpersonationBanner() {
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const cookie = document.cookie
      .split('; ')
      .find(c => c.startsWith('stasis-impersonating='));
    if (cookie) {
      try {
        setInfo(JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('='))));
      } catch {
        // ignore
      }
    }
  }, []);

  if (!info) return null;

  return (
    <div className="bg-purple-600 text-white px-4 py-2 text-sm flex items-center justify-between gap-4 z-50 relative">
      <span>
        Impersonating <strong>{info.name}</strong> (logged in as {info.adminName})
      </span>
      <button
        onClick={async () => {
          setEnding(true);
          try {
            const res = await fetch('/api/admin/impersonate', { method: 'DELETE' });
            if (res.ok) {
              window.location.href = '/admin/users';
            } else {
              alert('Failed to end impersonation');
              setEnding(false);
            }
          } catch {
            alert('Failed to end impersonation');
            setEnding(false);
          }
        }}
        disabled={ending}
        className="px-3 py-1 bg-white text-purple-600 text-xs uppercase font-medium hover:bg-purple-100 transition-colors cursor-pointer disabled:opacity-50"
      >
        {ending ? 'Ending...' : 'End Impersonation'}
      </button>
    </div>
  );
}
