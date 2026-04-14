'use client';

import { useState, useEffect } from 'react';

interface Props {
  onClick: () => void;
  todayComplete: boolean;
  unreachable: boolean;
}

export function TamagotchiPeek({ onClick, todayComplete, unreachable }: Readonly<Props>) {
  const [hopKey, setHopKey] = useState(0);

  // Preload overlay images so they're cached before the user clicks
  useEffect(() => {
    const img = new Image();
    img.src = '/tamagotchi.png';
  }, []);

  // Periodic hop every ~5s if user hasn't completed today's streak
  // Skip hopping entirely if the streak is no longer reachable
  useEffect(() => {
    if (todayComplete || unreachable) return;
    const interval = setInterval(() => setHopKey(k => k + 1), 5000);
    const initial = setTimeout(() => setHopKey(k => k + 1), 1500);
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, [todayComplete, unreachable]);

  return (
    <button
      onClick={onClick}
      className="fixed left-1/2 -translate-x-1/2 z-40 cursor-pointer p-0 border-none bg-transparent [--peek-y:0px] hover:[--peek-y:clamp(-8px,-0.6vw,-12px)]"
      style={{ outline: 'none', bottom: 'clamp(-38px, -3.2vw, -60px)' }}
    >
      <img
        key={hopKey}
        src="/tamagotchi-orange-border.png"
        alt="Tamagotchi"
        className={`object-contain ${!todayComplete && !unreachable && hopKey > 0 ? 'animate-[tamagotchi-hop_0.6s_ease-out]' : ''}`}
        style={{
          width: 'clamp(6rem, 8vw, 12rem)',
          height: 'clamp(6rem, 8vw, 12rem)',
          filter: 'drop-shadow(0 -4px 24px rgba(232, 106, 58, 0.5))',
          transform: 'translateY(var(--peek-y, 0px))',
          transition: 'transform 0.3s ease-out',
          opacity: unreachable ? 0.5 : 1,
        }}
      />
    </button>
  );
}
