'use client';

import { useState, useEffect, useCallback } from 'react';

interface Props {
  onClick: () => void;
}

const STARTED_KEY = 'tamagotchi_started';

export function TamagotchiPeek({ onClick }: Props) {
  const [started, setStarted] = useState(true); // default true to avoid bounce flash
  const [hopping, setHopping] = useState(false);

  useEffect(() => {
    setStarted(!!localStorage.getItem(STARTED_KEY));
  }, []);

  // Re-check the flag when the overlay closes and we become visible again
  useEffect(() => {
    const check = () => setStarted(!!localStorage.getItem(STARTED_KEY));
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  // Periodic hop every ~5s if user hasn't clicked Tell Me More yet
  const doHop = useCallback(() => {
    setHopping(true);
    setTimeout(() => setHopping(false), 500);
  }, []);

  useEffect(() => {
    if (started) return;
    const interval = setInterval(doHop, 5000);
    // First hop after a short delay
    const initial = setTimeout(doHop, 1500);
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, [started, doHop]);

  return (
    <button
      onClick={onClick}
      className="fixed left-1/2 -translate-x-1/2 z-40 cursor-pointer p-0 border-none bg-transparent [--peek-y:0px] hover:[--peek-y:-8px]"
      style={{ outline: 'none', bottom: '-38px' }}
    >
      <img
        src="/tamagotchi.png"
        alt="Tamagotchi"
        className="w-24 h-24 object-contain"
        style={{
          filter: 'drop-shadow(0 -4px 24px rgba(232, 106, 58, 0.5))',
          transform: `translateY(${hopping ? '-10px' : 'var(--peek-y, 0px)'})`,
          transition: hopping ? 'transform 0.15s ease-out' : 'transform 0.3s ease-out',
        }}
      />
    </button>
  );
}
