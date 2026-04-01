'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { TamagotchiPeek } from './TamagotchiPeek';
import { TamagotchiOverlay } from './TamagotchiOverlay';
import { isEventVisible } from '@/lib/tamagotchi';
import type { TamagotchiStatus } from '@/lib/tamagotchi';

export function TamagotchiCompanion() {
  const pathname = usePathname();
  const [status, setStatus] = useState<TamagotchiStatus | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/tamagotchi/status?tz=${encodeURIComponent(tz)}`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn('[Tamagotchi] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading || !status || !status.eventVisible) return null;
  if (!isEventVisible()) return null;
  if (pathname !== '/dashboard') return null;

  return (
    <>
      <TamagotchiPeek onClick={() => setOverlayOpen(true)} todayComplete={status.todayProgress.complete} />
      {overlayOpen && (
        <TamagotchiOverlay onClose={() => setOverlayOpen(false)} status={status} />
      )}
    </>
  );
}
