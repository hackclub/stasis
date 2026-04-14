import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { PlatformNoiseOverlay } from '../components/PlatformNoiseOverlay';

export const metadata: Metadata = {
  title: 'Docs - Stasis',
  description: 'Documentation for the Stasis hardware hackathon platform.',
  alternates: { canonical: 'https://stasis.hackclub.com/docs' },
};

export default function DocsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-clip">
      <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Image src="/stasis-logo.svg" alt="Stasis" width={120} height={40} className="h-10 w-auto" />
        </Link>
        <Link href="/dashboard" className="text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wide">
          Dashboard &rarr;
        </Link>
      </div>
      <main className="max-w-7xl mx-auto px-4 py-8">
        {children}
      </main>
      <PlatformNoiseOverlay />
    </div>
  );
}
