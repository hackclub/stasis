import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page Not Found - Stasis',
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#2A2318] font-mono flex items-center justify-center">
      <main className="text-center px-4">
        <h1 className="text-6xl text-orange-500 mb-4">404</h1>
        <p className="text-cream-400 text-xl mb-8">
          This page doesn&apos;t exist.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="bg-orange-600 text-cream-100 px-6 py-3 hover:bg-orange-500 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/starter-projects"
            className="border border-cream-500 text-cream-400 px-6 py-3 hover:bg-cream-500/10 transition-colors"
          >
            Starter Projects
          </Link>
        </div>
      </main>
    </div>
  );
}
