'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import PageBorder from '../components/PageBorder';
import { NoiseOverlay } from '../components/NoiseOverlay';

type Sponsor = {
  name: string;
  src: string;
  href: string;
  /** Tailwind height classes, responsive. Tune per-logo for optical balance. */
  heightClass: string;
};

const SPONSORS: readonly Sponsor[] = [
  {
    name: 'Alpha School',
    src: '/alphaschool-logo.svg',
    href: 'https://alpha.school/',
    heightClass: 'h-16 md:h-24',
  },
  {
    name: '021',
    src: '/021-logo.svg',
    href: 'https://www.021.vc/',
    heightClass: 'h-14 md:h-20',
  },
] as const;

function SponsorsContent() {
  const [footerHeight, setFooterHeight] = useState(0);

  return (
    <div className="bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono text-brown-800 bg-container overflow-x-hidden">
      <style jsx>{`
        .bg-container::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(#DAD2BF99, #DAD2BF99), url(/noise-smooth.png);
          pointer-events: none;
          z-index: -1;
        }
      `}</style>

      <div className="min-h-screen relative md:pt-12 z-0" style={{ paddingBottom: footerHeight }}>
        <div className="mx-auto max-w-4xl pt-14 pb-16 md:pt-24 md:pb-24 px-5 md:px-10 relative">
          <div className="space-y-10 md:space-y-14">
            {/* Logo — centered stasis lockup, no HC/OS mark */}
            <header className="text-center">
              <Link href="/" aria-label="Stasis home" className="inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> so height-based responsive sizing works without intrinsic-dimension constraints */}
                <img
                  src="/stasis-logo-center.svg"
                  alt="Stasis"
                  className="h-20 md:h-28 w-auto mx-auto select-none"
                />
              </Link>
            </header>

            {/* Title */}
            <section>
              <div className="relative mx-auto max-w-[460px] flex items-center justify-center mb-10 md:mb-12">
                <div className="absolute left-0 top-1/2 h-px w-[14%] bg-[#d95d39]" />
                <div className="absolute right-0 top-1/2 h-px w-[14%] bg-[#d95d39]" />
                <span className="absolute left-[14%] top-1/2 -translate-y-1/2 w-2 h-2 border-l-[3px] border-t-[3px] border-[#d95d39]" />
                <span className="absolute right-[14%] top-1/2 -translate-y-1/2 w-2 h-2 border-r-[3px] border-b-[3px] border-[#d95d39]" />
                <h1 className="text-[24px] uppercase tracking-wider text-[#d95d39] px-4 m-0">
                  Sponsors
                </h1>
              </div>

              {/* Sponsor grid — stacks on mobile, side-by-side on sm+. Append new entries to SPONSORS above. */}
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 list-none p-0 m-0">
                {SPONSORS.map((sponsor) => (
                  <li key={sponsor.name}>
                    <a
                      href={sponsor.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={sponsor.name}
                      className="bg-cream-100/60 border border-cream-400 flex items-center justify-center p-8 md:p-12 h-44 md:h-56 transition-colors hover:bg-cream-100 hover:border-[#d95d39]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- plain <img> so per-sponsor height classes drive sizing dynamically */}
                      <img
                        src={sponsor.src}
                        alt={sponsor.name}
                        className={`${sponsor.heightClass} w-auto select-none`}
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            {/* Breathing room below the cards */}
            <div className="h-24 md:h-40" aria-hidden="true" />
          </div>
        </div>
      </div>

      <PageBorder onFooterHeightChange={(h) => setFooterHeight(h)} />
      <NoiseOverlay />
    </div>
  );
}

export default function SponsorsPage() {
  return (
    <Suspense>
      <SponsorsContent />
    </Suspense>
  );
}
