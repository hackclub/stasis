'use client';

import { useEffect, useRef, useState } from 'react';

type Props = Readonly<{
  art: string;
  horizontalPosition: number;
  verticalOffset?: string;
}>;

export function ASCIIArt({ art, horizontalPosition, verticalOffset = '0' }: Props) {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMouseX(e.clientX - rect.left);
      setMouseY(e.clientY - rect.top);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute max-sm:hidden pointer-events-none select-none -z-1"
      style={{ left: `${horizontalPosition}%`, top: verticalOffset, transform: 'translateX(-50%)' }}
    >
      <pre className="text-cream-800/12 text-[0.7rem] leading-[1.2] whitespace-pre font-mono text-left">
        {art}
      </pre>
      <pre
        className="absolute top-0 left-0 text-cream-800/25 text-[0.7rem] leading-[1.2] whitespace-pre font-mono text-left"
        style={{
          maskImage: `radial-gradient(circle 150px at ${mouseX}px ${mouseY}px, black 0%, transparent 100%)`,
          WebkitMaskImage: `radial-gradient(circle 150px at ${mouseX}px ${mouseY}px, black 0%, transparent 100%)`,
        }}
      >
        {art}
      </pre>
    </div>
  );
}
