'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const certLogos = [
  { src: '/mit-orange.png', alt: 'MIT', href: 'https://www.mit.edu' },
  { src: '/github-orange.png', alt: 'GitHub', href: 'https://github.com' },
  { src: '/amd-orange.png', alt: 'AMD', href: 'https://www.amd.com' },
  { src: '/gwc-orange.png', alt: 'Girls Who Code', href: 'https://girlswhocode.com' },
  { src: '/CAC-orange.png', alt: 'Congressional App Challenge', href: 'https://www.congressionalappchallenge.us' },
];

type SlotState = 'built' | 'building' | 'designing' | 'empty';

interface Slot {
  state: SlotState;
  title?: string;
  id?: string;
}

interface ProjectData {
  id: string;
  title: string;
  stage: 'DESIGN' | 'BUILD';
  designStatus: string;
  buildStatus: string;
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

function projectToSlot(p: ProjectData): { state: SlotState; priority: number } {
  if (p.stage === 'BUILD' && p.buildStatus === 'approved') return { state: 'built', priority: 0 };
  if (p.stage === 'BUILD') return { state: 'building', priority: 1 };
  return { state: 'designing', priority: 2 };
}

export default function CertificatePage() {
  const [slots, setSlots] = useState<Slot[]>([
    { state: 'empty' }, { state: 'empty' }, { state: 'empty' },
  ]);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.ok ? res.json() : [])
      .then((projects: ProjectData[]) => {
        const scored = projects
          .map(p => ({ ...p, ...projectToSlot(p) }))
          .sort((a, b) => a.priority - b.priority);

        const filled: Slot[] = scored.slice(0, 3).map(p => ({
          state: p.state,
          title: p.title,
          id: p.id,
        }));

        while (filled.length < 3) filled.push({ state: 'empty' });

        let built = 0, designed = 0;
        for (const p of projects) {
          if (p.stage === 'BUILD' && p.buildStatus === 'approved') built++;
          else if (p.stage === 'BUILD') designed++;
        }

        setSlots(filled);
        setProgressText(getProgressText(built, designed));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-orange-500 text-lg leading-none">&#9733;</span>
        <span className="text-xs uppercase tracking-widest text-orange-500">New</span>
      </div>

      <h1 className="text-[24px] md:text-[30px] uppercase text-brown-800 tracking-wide leading-tight mb-4">
        The Hack Club Stasis Certificate
      </h1>

      <p className="text-[14px] md:text-[18px] leading-snug text-brown-800 mb-8">
        Build <strong>3 projects</strong> and we&apos;ll send you a hardware engineering certificate - proof of your skills, recognized by leaders in tech and education.
      </p>

      {/* Recognized by */}
      <div className="mb-10">
        <div className="relative">
          <div className="absolute -top-[12px] left-0 right-0 flex items-center justify-center gap-3 z-10">
            <div className="w-[20px] h-px bg-[#d95d39]" />
            <span className="text-sm uppercase tracking-wider text-[#d95d39] bg-[#DAD2BF] px-2">Recognized by</span>
            <div className="w-[20px] h-px bg-[#d95d39]" />
          </div>
          <div className="absolute left-0 top-0 w-[14px] h-[14px] border-l-[2px] border-t-[2px] border-[#d95d39]" />
          <div className="absolute right-0 top-0 w-[14px] h-[14px] border-r-[2px] border-t-[2px] border-[#d95d39]" />
          <div className="absolute left-0 bottom-0 w-[14px] h-[14px] border-l-[2px] border-b-[2px] border-[#d95d39]" />
          <div className="absolute right-0 bottom-0 w-[14px] h-[14px] border-r-[2px] border-b-[2px] border-[#d95d39]" />
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5 px-6 py-5 pt-7 min-h-[60px]">
            {certLogos.map((logo, i) => (
              <a key={i} href={logo.href} target="_blank" rel="noopener noreferrer">
                <img src={logo.src} alt={logo.alt} className="h-8 md:h-10 w-auto object-contain transition-opacity duration-150 hover:opacity-70" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Progress text */}
      {progressText && (
        <p className="text-[14px] md:text-[18px] text-brown-800 mb-8">{progressText}</p>
      )}

      {/* Status tracker */}
      {loaded && (
        <div className="mb-4">
          <div className="text-[14px] uppercase tracking-widest text-brown-800 mb-4">Your progress</div>
          <div className="grid grid-cols-3 gap-3">
            {slots.map((slot, i) => {
              const isBuilt = slot.state === 'built';
              const isBuilding = slot.state === 'building';
              const isDesigning = slot.state === 'designing';
              const isEmpty = slot.state === 'empty';

              const content = (
                <div
                  className={`relative p-4 h-full transition-colors ${
                    isBuilt
                      ? 'bg-orange-500'
                      : isBuilding
                        ? 'bg-cream-300 border-2 border-orange-500'
                        : isDesigning
                          ? 'bg-cream-300 border-2 border-cream-500'
                          : 'border-2 border-dashed border-cream-500'
                  }`}
                >
                  {/* Step number */}
                  <div className={`text-[11px] uppercase tracking-widest mb-3 ${
                    isBuilt ? 'text-cream-100/70' : 'text-brown-800/40'
                  }`}>
                    {String(i + 1).padStart(2, '0')}
                  </div>

                  {/* Status label */}
                  <div className={`text-[14px] md:text-[16px] uppercase tracking-wide ${
                    isBuilt
                      ? 'text-cream-100'
                      : isBuilding || isDesigning
                        ? 'text-brown-800'
                        : 'text-brown-800/40'
                  }`}>
                    {isBuilt && 'Built'}
                    {isBuilding && 'Building'}
                    {isDesigning && 'Designing'}
                    {isEmpty && 'Empty'}
                  </div>

                  {/* Project title */}
                  {slot.title && (
                    <div className={`text-[12px] mt-1 truncate ${
                      isBuilt ? 'text-cream-100/70' : 'text-brown-800/60'
                    }`}>
                      {slot.title}
                    </div>
                  )}

                  {/* Built checkmark */}
                  {isBuilt && (
                    <div className="absolute top-4 right-4 text-cream-100 text-[16px]">&#10003;</div>
                  )}
                </div>
              );

              if (isEmpty) {
                return (
                  <Link key={i} href="/dashboard" className="block hover:border-orange-500 transition-colors group">
                    <div className="relative p-4 h-full border-2 border-dashed border-cream-500 group-hover:border-orange-500 transition-colors">
                      <div className="text-[11px] uppercase tracking-widest mb-3 text-brown-800/40">
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div className="text-[14px] md:text-[16px] uppercase tracking-wide text-brown-800/40 group-hover:text-orange-500 transition-colors">
                        Start a project
                      </div>
                    </div>
                  </Link>
                );
              }

              if (slot.id) {
                return (
                  <Link key={i} href={`/dashboard/projects/${slot.id}`} className="block">
                    {content}
                  </Link>
                );
              }

              return <div key={i}>{content}</div>;
            })}
          </div>

          {/* Progress bar — each project worth 33.3%, weighted: designing 20%, building 60%, built 100% */}
          <div className="mt-4 h-[6px] bg-cream-300 overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-500"
              style={{ width: `${slots.reduce((sum, s) => {
                if (s.state === 'built') return sum + 100 / 3;
                if (s.state === 'building') return sum + 60 / 3;
                if (s.state === 'designing') return sum + 20 / 3;
                return sum;
              }, 0)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
