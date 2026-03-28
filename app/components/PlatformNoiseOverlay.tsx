'use client';

import { useEffect, useState } from 'react';
import { NoiseOverlay } from './NoiseOverlay';

export function PlatformNoiseOverlay() {
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('disableGrain');
    if (stored === 'true') {
      setDisabled(true);
      return;
    }

    fetch('/api/user/grain')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.disableGrain) {
          setDisabled(true);
          localStorage.setItem('disableGrain', 'true');
        } else {
          localStorage.setItem('disableGrain', 'false');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleGrainChange(e: CustomEvent<{ disabled: boolean }>) {
      setDisabled(e.detail.disabled);
    }
    window.addEventListener('grain-preference-changed', handleGrainChange as EventListener);
    return () => window.removeEventListener('grain-preference-changed', handleGrainChange as EventListener);
  }, []);

  if (disabled) return null;
  return <NoiseOverlay />;
}
