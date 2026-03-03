'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface FooterProps {
  inset?: string;
}

export function Footer({ inset = '3rem' }: Readonly<FooterProps>) {
  const pathname = usePathname();
  const isLanding = pathname === '/';
  const [mouseX, setMouseX] = useState(-1000);
  const [mouseY, setMouseY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMouseX(e.clientX - rect.left);
    setMouseY(e.clientY - rect.top);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  return (
    <footer className="pointer-events-auto pt-16">
      <div
        className="text-center pointer-events-auto pb-12 px-4
        "
      >
        <div className="mx-auto w-full text-center">
          <p className="font-mono text-xs md:text-sm">
            Made with <span className="bg-orange-500 text-cream-100">&lt;3</span> by teenagers, for teenagers
          </p>
          <div className="mt-2 mx-auto">
            <a href="https://hackclub.com" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-500 hover:text-cream-100">Hack Club</a>
            <span>・</span>
            <a href="https://hackclub.com/slack" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-500 hover:text-cream-100">Slack</a>
            <span>・</span>
            <a href="https://hackclub.com/clubs" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-500 hover:text-cream-100">Clubs</a>
            <span>・</span>
            <a href="https://hackclub.com/hackathons" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-500 hover:text-cream-100">Hackathons</a>
          </div>
          {isLanding && (
            <p className="mt-4 text-sm opacity-40">
              Site by <a href="https://github.com/gusruben/" target="_blank" rel="noopener" className="underline">Augie</a>
            </p>
          )}
        </div>
      </div>

      <div ref={containerRef} className="md:opacity-10 relative mx-auto w-full md:w-[calc(100%-6rem)] pointer-events-none translate-y-0.5">
        <img src="/stasis-text.svg" alt="" className="w-full absolute md:hidden" />
        <img src="/stasis-text-stroke.svg" alt="" className="w-full opacity-50" />
        <img
          src="/stasis-text.svg"
          alt=""
          className="absolute top-0 left-0 w-full"
          style={{
            maskImage: `radial-gradient(circle 400px at ${mouseX}px ${mouseY}px, #383734 0%, transparent 100%)`,
            WebkitMaskImage: `radial-gradient(circle 400px at ${mouseX}px ${mouseY}px, #383734 0%, transparent 100%)`
          }}
        />
      </div>
      <div className="md:hidden w-full h-12 bg-brown-800"></div>
    </footer>
  );
}
