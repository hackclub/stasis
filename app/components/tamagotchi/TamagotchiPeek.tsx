'use client';

import { useState, useEffect } from 'react';

interface Props {
  onClick: () => void;
}

const STARTED_KEY = 'tamagotchi_started';

export function TamagotchiPeek({ onClick }: Props) {
  const [started, setStarted] = useState(true); // default true to avoid bounce flash

  useEffect(() => {
    setStarted(!!localStorage.getItem(STARTED_KEY));
  }, []);

  // Re-check the flag when the overlay closes and we become visible again
  useEffect(() => {
    const check = () => setStarted(!!localStorage.getItem(STARTED_KEY));
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  return (
    <button
      onClick={onClick}
      className="fixed left-1/2 -translate-x-1/2 z-40 cursor-pointer p-0 border-none bg-transparent"
      style={{ outline: 'none', bottom: '-38px' }}
    >
      <img
        src="/tamagotchi.png"
        alt="Tamagotchi"
        className={`w-24 h-24 object-contain ${!started ? 'animate-[tamagotchi-nudge_4.5s_ease-in-out_infinite]' : ''}`}
        style={{ filter: 'drop-shadow(0 -4px 24px rgba(232, 106, 58, 0.5))' }}
      />
    </button>
  );
}
