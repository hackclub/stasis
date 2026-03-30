'use client';

import { useState, useEffect } from 'react';

interface Props {
  onClick: () => void;
  todayComplete: boolean;
}

export function TamagotchiPeek({ onClick, todayComplete }: Readonly<Props>) {
  const [hopKey, setHopKey] = useState(0);

  // Preload overlay images so they're cached before the user clicks
  useEffect(() => {
    const img = new Image();
    img.src = '/tamagotchi.png';
  }, []);

  // Periodic hop every ~5s if user hasn't completed today's streak
  useEffect(() => {
    if (todayComplete) return;
    const interval = setInterval(() => setHopKey(k => k + 1), 5000);
    const initial = setTimeout(() => setHopKey(k => k + 1), 1500);
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, [todayComplete]);

  return (
    <button
      onClick={onClick}
      className="fixed left-1/2 -translate-x-1/2 z-40 cursor-pointer p-0 border-none bg-transparent [--peek-y:0px] hover:[--peek-y:-8px]"
      style={{ outline: 'none', bottom: '-38px' }}
    >
      <img
        key={hopKey}
        src="/tamagotchi-orange-border.png"
        alt="Tamagotchi"
        className={`w-24 h-24 object-contain ${!todayComplete && hopKey > 0 ? 'animate-[tamagotchi-hop_0.6s_ease-out]' : ''}`}
        style={{
          filter: 'drop-shadow(0 -4px 24px rgba(232, 106, 58, 0.5))',
          transform: 'translateY(var(--peek-y, 0px))',
          transition: 'transform 0.3s ease-out',
        }}
      />
    </button>
  );
}
