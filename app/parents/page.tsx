'use client';

import Link from 'next/link';
import type { MDXComponents } from 'mdx/types';
import Parents from '../dashboard/help/content/parents.mdx';
import { NoiseOverlay } from '../components/NoiseOverlay';

const mdxComponents: MDXComponents = {
  h2: ({ children }) => (
    <h2 className="text-orange-400 text-xl uppercase mt-8 mb-4">{children as React.ReactNode}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-brown-800 text-lg mt-6 mb-3">{children as React.ReactNode}</h3>
  ),
  p: ({ children }) => (
    <p className="text-brown-800">{children as React.ReactNode}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-brown-800 space-y-1">{children as React.ReactNode}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-brown-800 space-y-1">{children as React.ReactNode}</ol>
  ),
  li: ({ children }) => (
    <li className="text-brown-800">{children as React.ReactNode}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-bold">{children as React.ReactNode}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children as React.ReactNode}</em>
  ),
  a: ({ children, href }) => (
    <a href={href} className="text-orange-500 underline">{children as React.ReactNode}</a>
  ),
};

export default function ParentsPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">
      <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <img src="/stasis-logo.svg" alt="Stasis" className="h-10 w-auto" />
        </Link>
        <Link href="/dashboard" className="text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wide">
          Dashboard &rarr;
        </Link>
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-cream-100 border-2 border-cream-400 p-4 md:p-6">
          <h1 className="text-orange-500 text-xl md:text-2xl uppercase tracking-wide mb-4 md:mb-6">
            Guide for Parents
          </h1>
          <div className="prose max-w-none space-y-6 text-brown-800">
            <Parents components={mdxComponents} />
          </div>
        </div>
      </div>
      <NoiseOverlay />
    </div>
  );
}
