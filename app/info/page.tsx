'use client';

import Image from 'next/image';
import Link from 'next/link';
import GuidesContent from '../components/GuidesContent';
import { PlatformNoiseOverlay } from '../components/PlatformNoiseOverlay';

export default function PublicGuidesPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">
      <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Image src="/stasis-logo.svg" alt="Stasis" width={120} height={40} className="h-10 w-auto" />
        </Link>
        <Link href="/dashboard" className="text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wide">
          Dashboard &rarr;
        </Link>
      </div>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <GuidesContent />
      </main>
      <PlatformNoiseOverlay />
    </div>
  );
}
