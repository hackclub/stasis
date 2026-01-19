'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signIn, signOut } from "@/lib/auth-client";
import { gsap } from 'gsap';
import { NoiseOverlay } from '../components/NoiseOverlay';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const lineConfigs = [
  { from: 80, to: 200, duration: 60, direction: 1 },
  { from: 200, to: 320, duration: 80, direction: -1 },
  { from: 320, to: 600, duration: 105, direction: 1 },
  { from: 600, to: 720, duration: 50, direction: -1 },
  { from: 720, to: 1080, duration: 95, direction: 1 }
];

const circles = [160, 400, 640, 1200, 1440, 2160];

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { data: session, isPending } = useSession();
  const [isAdmin, setIsAdmin] = useState(false);
  const [gridOffset, setGridOffset] = useState(0);
  const svgContainerRef = useRef<SVGSVGElement>(null);
  const rotationTweensRef = useRef<gsap.core.Tween[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    if (session) {
      fetch('/api/user')
        .then(res => res.json())
        .then(data => setIsAdmin(data.isAdmin ?? false))
        .catch(() => setIsAdmin(false));
    }
  }, [session]);

  useEffect(() => {
    const animate = () => {
      setGridOffset(prev => prev + 0.2);
      requestAnimationFrame(animate);
    };
    const frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const svgContainer = svgContainerRef.current;
    if (!svgContainer) return;

    const lines = [
      { from: 80, to: 200, duration: 60, direction: 1 },
      { from: 200, to: 320, duration: 80, direction: -1 },
      { from: 320, to: 600, duration: 105, direction: 1 },
      { from: 600, to: 720, duration: 50, direction: -1 },
      { from: 720, to: 1080, duration: 95, direction: 1 }
    ];

    lines.forEach((line, i) => {
      const lineGroup1 = svgContainer.querySelector(`[data-line-group="${i}-1"]`);
      const lineGroup2 = svgContainer.querySelector(`[data-line-group="${i}-2"]`);
      const square1a = svgContainer.querySelector(`[data-square="${i}-1a"]`);
      const square1b = svgContainer.querySelector(`[data-square="${i}-1b"]`);
      const square2a = svgContainer.querySelector(`[data-square="${i}-2a"]`);
      const square2b = svgContainer.querySelector(`[data-square="${i}-2b"]`);

      if (lineGroup1 && lineGroup2 && square1a && square1b && square2a && square2b) {
        const tween1 = gsap.to(lineGroup1, {
          rotation: 360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: '700 400'
        });
        
        const tween2 = gsap.to(lineGroup2, {
          rotation: 360 * line.direction,
          duration: line.duration,
          repeat: -1,
          ease: 'none',
          svgOrigin: '700 400'
        });

        const counterRotation = -360 * line.direction;
        const tween3 = gsap.to(square1a, { rotation: counterRotation, duration: line.duration, repeat: -1, ease: 'none', svgOrigin: '700 400' });
        const tween4 = gsap.to(square1b, { rotation: counterRotation, duration: line.duration, repeat: -1, ease: 'none', svgOrigin: '700 400' });
        const tween5 = gsap.to(square2a, { rotation: counterRotation, duration: line.duration, repeat: -1, ease: 'none', svgOrigin: '700 400' });
        const tween6 = gsap.to(square2b, { rotation: counterRotation, duration: line.duration, repeat: -1, ease: 'none', svgOrigin: '700 400' });
        
        rotationTweensRef.current.push(tween1, tween2, tween3, tween4, tween5, tween6);
      }
    });

    return () => {
      gsap.killTweensOf('*');
    };
  }, []);

  const getTabClass = (tabPath: string) => {
    const isActive = tabPath === '/dashboard' 
      ? pathname === '/dashboard'
      : pathname.startsWith(tabPath);
    
    return `px-6 py-3 text-sm uppercase tracking-wider transition-colors border-b-2 -mb-[2px] ${
      isActive
        ? 'text-brand-400 border-brand-400'
        : 'text-cream-300 border-transparent hover:text-cream-50'
    }`;
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-300">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
          <div className="bg-cream-900 border-2 border-cream-600 p-8 max-w-md w-full mx-4">
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-2xl uppercase tracking-wide text-brand-500 mb-2">
                  Dashboard
                </h1>
                <p className="text-cream-300 text-sm">
                  Sign in to continue
                </p>
              </div>
              <button
                onClick={() =>
                  signIn.oauth2({
                    providerId: "hca",
                    callbackURL: "/dashboard",
                  })
                }
                className="w-full bg-brand-500 hover:bg-brand-400 px-6 py-3 text-lg uppercase tracking-wider text-white font-medium transition-colors cursor-pointer"
              >
                Sign In with Hack Club
              </button>
            </div>
          </div>
        </div>
        <NoiseOverlay />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-[linear-gradient(#40352999,#40352999),url(/noise-smooth-dark.png)] font-mono relative overflow-hidden">
        {/* Animated grid background */}
        <div 
          className="absolute inset-0 opacity-40 -z-10 pointer-events-none"
          style={{
            backgroundImage: 'url(/grid-texture.png)',
            backgroundSize: '8rem 8rem',
            backgroundPosition: `${gridOffset * Math.cos(30 * Math.PI / 180)}px ${gridOffset * Math.sin(30 * Math.PI / 180)}px`,
            imageRendering: 'pixelated'
          }}
        />
        
        {/* Rotating SVG decoration */}
        <svg ref={svgContainerRef} className="absolute inset-0 w-full h-full -z-5 pointer-events-none opacity-30" viewBox="0 0 1400 800" preserveAspectRatio="xMidYMid slice">
          {circles.map((diameter) => (
            <circle key={diameter} cx="700" cy="400" r={diameter / 2} fill="none" stroke="#44382C" strokeWidth="2" />
          ))}
          
          {lineConfigs.map((line, i) => (
            <g key={i}>
              <g data-line-group={`${i}-1`}>
                <line x1="700" y1={400 - line.from} x2="700" y2={400 - line.to} stroke="#44382C" strokeWidth="2" />
                <g data-square={`${i}-1a`}>
                  <rect x={700 - 4} y={400 - line.from - 4} width="8" height="8" fill="#44382C" />
                </g>
                <g data-square={`${i}-1b`}>
                  <rect x={700 - 4} y={400 - line.to - 4} width="8" height="8" fill="#44382C" />
                </g>
              </g>
              
              <g data-line-group={`${i}-2`}>
                <line x1="700" y1={400 + line.from} x2="700" y2={400 + line.to} stroke="#44382C" strokeWidth="2" />
                <g data-square={`${i}-2a`}>
                  <rect x={700 - 4} y={400 + line.from - 4} width="8" height="8" fill="#44382C" />
                </g>
                <g data-square={`${i}-2b`}>
                  <rect x={700 - 4} y={400 + line.to - 4} width="8" height="8" fill="#44382C" />
                </g>
              </g>
            </g>
          ))}
        </svg>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href="/" className="text-cream-300 hover:text-brand-400 transition-colors">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </Link>
          <div className="flex items-center gap-6">
            <span className="text-cream-300 text-sm hidden sm:block">
              {session.user.name || session.user.email}
            </span>
            {isAdmin && (
              <Link
                href="/admin"
                className="text-cream-300 hover:text-brand-400 text-sm uppercase transition-colors"
              >
                Admin
              </Link>
            )}
            <button
              onClick={() => signOut()}
              className="text-cream-300 hover:text-brand-400 text-sm uppercase transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-cream-800">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-0">
              <Link href="/dashboard" className={getTabClass('/dashboard')}>
                Projects
              </Link>
              <Link href="/dashboard/guides" className={getTabClass('/dashboard/guides')}>
                Guides & FAQ
              </Link>
              <Link href="/dashboard/settings" className={getTabClass('/dashboard/settings')}>
                Settings
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </div>
      </div>

      <NoiseOverlay />
    </>
  );
}
