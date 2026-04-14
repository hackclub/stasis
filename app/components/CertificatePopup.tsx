'use client';

import { useState, useEffect } from 'react';

const DISMISSED_KEY = 'stasis_certificate_popup_dismissed';

const certLogos = [
  { src: '/mit-orange.png', alt: 'MIT', href: 'https://www.mit.edu' },
  { src: '/github-orange.png', alt: 'GitHub', href: 'https://github.com' },
  { src: '/amd-orange.png', alt: 'AMD', href: 'https://www.amd.com' },
  { src: '/gwc-orange.png', alt: 'Girls Who Code', href: 'https://girlswhocode.com' },
  { src: '/CAC-orange.png', alt: 'Congressional App Challenge', href: 'https://www.congressionalappchallenge.us' },
];

interface ProjectData {
  stage: 'DESIGN' | 'BUILD';
  buildStatus: string;
  designStatus: string;
}

function useProgress() {
  const [built, setBuilt] = useState(0);
  const [designed, setDesigned] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.ok ? res.json() : [])
      .then((projects: ProjectData[]) => {
        let b = 0, d = 0;
        for (const p of projects) {
          if (p.stage === 'BUILD' && p.buildStatus === 'approved') b++;
          else if (p.stage === 'BUILD') d++;
        }
        setBuilt(b);
        setDesigned(d);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  return { built, designed, loaded };
}

function getProgressText(built: number, designed: number): string | null {
  if (built >= 3) return "You've earned your certificate!";
  if (built === 2) return "You've already built 2 projects - just 1 more to go.";
  if (built === 1 && designed > 0) return `You've already built 1 project and designed ${designed} more - keep going!`;
  if (built === 1) return "You've already built 1 project - 2 more to go.";
  if (designed >= 2) return `You've already designed ${designed} projects - finish building them to earn your certificate.`;
  if (designed === 1) return "You've already designed 1 project, you're on your way.";
  return null;
}

interface CertificatePopupProps {
  onDismiss?: () => void;
}

export function CertificatePopup({ onDismiss }: Readonly<CertificatePopupProps>) {
  const [shouldShow, setShouldShow] = useState(false);
  const [animated, setAnimated] = useState(false);
  const { built, designed, loaded } = useProgress();

  useEffect(() => {
    if (!localStorage.getItem(DISMISSED_KEY)) {
      setShouldShow(true);
      // Trigger animation on next frame so initial state renders first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimated(true));
      });
    }
  }, []);

  useEffect(() => {
    if (!shouldShow) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shouldShow]);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setAnimated(false);
    setTimeout(() => {
      setShouldShow(false);
      onDismiss?.();
    }, 300);
  };

  if (!shouldShow) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black transition-opacity duration-300 ease-out"
        style={{ opacity: animated ? 0.75 : 0 }}
        onClick={dismiss}
      />
      <div
        className="relative bg-cream-100 border-2 border-orange-500 max-w-md w-full shadow-2xl transition-all duration-300 ease-out"
        style={{
          opacity: animated ? 1 : 0,
          transform: animated ? 'translateY(0)' : 'translateY(-40px)',
        }}
      >
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-brown-800 hover:text-orange-500 text-xl leading-none cursor-pointer transition-colors z-10"
        >
          &times;
        </button>

        <div className="px-6 pt-7 pb-6">
          {/* Badge icon area */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-orange-500 text-lg leading-none">&#9733;</span>
            <span className="text-xs uppercase tracking-widest text-orange-500">New</span>
          </div>

          <h2 className="text-xl md:text-2xl uppercase text-brown-800 tracking-wide leading-tight mb-3">
            Introducing the Hack Club Stasis Certificate
          </h2>

          <p className="text-sm leading-relaxed text-brown-800/80">
            Build <strong className="text-brown-800">3 projects</strong> and we&apos;ll send you a certificate proving your hardware skills.
          </p>
        </div>

        {/* Recognized by — lifted from landing page */}
        <div className="mx-4 mb-6">
          <div className="relative">
            <div className="absolute -top-[12px] left-0 right-0 flex items-center justify-center gap-3 z-10">
              <div className="w-[20px] h-px bg-[#d95d39]" />
              <span className="text-sm uppercase tracking-wider text-[#d95d39] bg-cream-100 px-2">Recognized by</span>
              <div className="w-[20px] h-px bg-[#d95d39]" />
            </div>
            <div className="absolute left-0 top-0 w-[14px] h-[14px] border-l-[2px] border-t-[2px] border-[#d95d39]" />
            <div className="absolute right-0 top-0 w-[14px] h-[14px] border-r-[2px] border-t-[2px] border-[#d95d39]" />
            <div className="absolute left-0 bottom-0 w-[14px] h-[14px] border-l-[2px] border-b-[2px] border-[#d95d39]" />
            <div className="absolute right-0 bottom-0 w-[14px] h-[14px] border-r-[2px] border-b-[2px] border-[#d95d39]" />
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 px-5 py-4 pt-6 min-h-[60px]">
              {certLogos.map((logo, i) => (
                <a key={i} href={logo.href} target="_blank" rel="noopener noreferrer">
                  <img src={logo.src} alt={logo.alt} className="h-7 md:h-8 w-auto object-contain transition-opacity duration-150 hover:opacity-70" loading="eager" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Progress */}
        {loaded && (() => {
          const text = getProgressText(built, designed);
          if (!text) return null;
          return (
            <div className="mx-6 mb-5 text-sm text-brown-800/70 text-center">
              {text}
            </div>
          );
        })()}

        {/* CTA */}
        <div className="px-6 pb-7">
          <button
            onClick={dismiss}
            className="w-full bg-orange-500 hover:bg-orange-400 text-cream-100 px-4 py-2.5 text-sm uppercase tracking-wider transition-colors cursor-pointer"
          >
            Start building
          </button>
        </div>
      </div>
    </div>
  );
}
