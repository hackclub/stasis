'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { MDXComponents } from 'mdx/types';
import Parents from '../dashboard/help/content/parents.mdx';
import { PlatformNoiseOverlay } from '../components/PlatformNoiseOverlay';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getTextContent(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getTextContent).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return '';
}

interface TocEntry { id: string; text: string; level: number }

function useTableOfContents(contentRef: React.RefObject<HTMLDivElement | null>) {
  const [headings, setHeadings] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      const els = el.querySelectorAll('h2[id], h3[id]');
      const entries: TocEntry[] = [];
      els.forEach((heading) => {
        entries.push({
          id: heading.id,
          text: heading.textContent || '',
          level: heading.tagName === 'H2' ? 2 : 3,
        });
      });
      setHeadings(entries);
      setActiveId('');
    }, 100);
    return () => clearTimeout(timer);
  }, [contentRef]);

  useEffect(() => {
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );
    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [headings]);

  return { headings, activeId };
}

const mdxComponents: MDXComponents = {
  h2: ({ children }) => {
    const text = getTextContent(children);
    const id = slugify(text);
    return <h2 id={id} className="text-orange-400 text-xl uppercase mt-8 mb-4">{children as React.ReactNode}</h2>;
  },
  h3: ({ children }) => {
    const text = getTextContent(children);
    const id = slugify(text);
    return <h3 id={id} className="text-brown-800 text-lg mt-6 mb-3">{children as React.ReactNode}</h3>;
  },
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
  table: ({ children }) => (
    <table className="w-full text-brown-800 text-sm">{children as React.ReactNode}</table>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-cream-400 text-left">{children as React.ReactNode}</thead>
  ),
  th: ({ children }) => (
    <th className="py-1.5 pr-4 font-bold text-orange-400 uppercase text-xs tracking-wide">{children as React.ReactNode}</th>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-cream-300">{children as React.ReactNode}</tbody>
  ),
  tr: ({ children }) => (
    <tr>{children as React.ReactNode}</tr>
  ),
  td: ({ children }) => (
    <td className="py-1.5 pr-4">{children as React.ReactNode}</td>
  ),
};

export default function ParentsPage() {
  const contentRef = useRef<HTMLDivElement>(null);
  const { headings: tocHeadings, activeId: tocActiveId } = useTableOfContents(contentRef);

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
        <div className="flex flex-col md:grid md:grid-cols-[1fr_14rem] md:gap-6">
          {/* Content */}
          <div className="min-w-0">
            <div ref={contentRef} className="bg-cream-100 border-2 border-cream-400 p-4 md:p-6">
              <h1 className="text-orange-500 text-xl md:text-2xl uppercase tracking-wide mb-4 md:mb-6">
                Guide for Parents
              </h1>
              <div className="prose max-w-none space-y-6 text-brown-800">
                <div className="p-4 bg-orange-500/10 border border-orange-500/30 text-orange-600 text-sm">
                  This parents guide refers to the in-person Stasis hackathon, not Open Sauce.
                </div>
                <Parents components={mdxComponents} />
              </div>
            </div>
          </div>

          {/* Table of Contents sidebar - desktop only */}
          <div className="hidden md:block">
            {tocHeadings.length > 0 && (
              <nav className="bg-cream-100 border-2 border-cream-400 p-4 sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
                <p className="text-brown-800 text-xs uppercase mb-3 tracking-wide">On this page</p>
                <div className="space-y-0.5">
                  {tocHeadings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className={`block text-sm py-1 transition-colors ${
                        heading.level === 3 ? 'pl-3' : 'pl-0'
                      } ${
                        tocActiveId === heading.id
                          ? 'text-orange-500'
                          : 'text-brown-800 hover:text-orange-500'
                      }`}
                    >
                      {heading.text}
                    </a>
                  ))}
                </div>
              </nav>
            )}
          </div>
        </div>
      </main>
      <PlatformNoiseOverlay />
    </div>
  );
}
