'use client';

import { useState, useEffect } from 'react';
import type { MDXComponents } from 'mdx/types';
import SubmissionGuidelines from '../dashboard/guides/content/submission-guidelines.mdx';
import FAQ from '../dashboard/guides/content/faq.mdx';
import Overview from '../dashboard/guides/content/overview.mdx';
import ProjectGuidelines from '../dashboard/guides/content/project-guidelines.mdx';
import SubmittingYourProject from '../dashboard/guides/content/submitting-your-project.mdx';
import AboutCost from '../dashboard/guides/content/about-cost.mdx';

type GuidePage = 'overview' | 'submission-guidelines' | 'project-guidelines' | 'submitting-your-project' | 'about-cost' | 'faq';

const GUIDE_PAGES: { id: GuidePage; label: string; heading?: string; section: 'guides' | 'faq' }[] = [
  { id: 'overview', label: 'Overview', section: 'guides' },
  { id: 'submission-guidelines', label: 'Submission Guidelines', section: 'guides' },
  { id: 'project-guidelines', label: 'Project Guidelines', section: 'guides' },
  { id: 'submitting-your-project', label: 'Submitting Your Project', section: 'guides' },
  { id: 'about-cost', label: 'About Cost', section: 'guides' },
  { id: 'faq', label: 'General FAQ', heading: 'Frequently Asked Questions', section: 'faq' },
];

const mdxComponents: MDXComponents = {
  h2: ({ children }) => (
    <h2 className="text-orange-400 text-xl uppercase mt-8 mb-4">{children as React.ReactNode}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-brown-800 text-lg mt-6 mb-3">{children as React.ReactNode}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-brown-800 font-medium mt-4 mb-2">{children as React.ReactNode}</h4>
  ),
  p: ({ children }) => (
    <p className="text-brown-800">{children as React.ReactNode}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-brown-800 space-y-1">{children as React.ReactNode}</ul>
  ),
  strong: ({ children }) => (
    <strong className="font-bold">{children as React.ReactNode}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children as React.ReactNode}</em>
  ),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PAGE_CONTENT: Record<GuidePage, React.ComponentType<any>> = {
  'overview': Overview,
  'submission-guidelines': SubmissionGuidelines,
  'project-guidelines': ProjectGuidelines,
  'submitting-your-project': SubmittingYourProject,
  'about-cost': AboutCost,
  'faq': FAQ,
};

export default function GuidesContent() {
  const [activeGuidePage, setActiveGuidePage] = useState<GuidePage>('submission-guidelines');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1) as GuidePage;
    if (GUIDE_PAGES.some(p => p.id === hash)) {
      setActiveGuidePage(hash);
    }
  }, []);

  const currentPage = GUIDE_PAGES.find(p => p.id === activeGuidePage);
  const guidePages = GUIDE_PAGES.filter(p => p.section === 'guides');
  const faqPages = GUIDE_PAGES.filter(p => p.section === 'faq');
  const ActiveContent = PAGE_CONTENT[activeGuidePage];

  return (
    <div className="relative flex flex-col md:block">
      {/* Sidebar Navigation - dropdown on mobile, absolutely positioned on desktop */}
      <div className="w-full md:w-56 md:absolute md:right-[calc(50%+theme(maxWidth.3xl)/2+1.5rem)]">
        <nav className="bg-cream-100 border-2 border-cream-400 p-3 md:p-4 md:sticky md:top-8">
          {/* Mobile: dropdown menu */}
          <div className="md:hidden relative">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm text-orange-500 bg-cream-200 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {/* Hamburger icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
                <span>{currentPage?.label}</span>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform ${mobileMenuOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {mobileMenuOpen && (
              <div className="absolute top-full left-0 right-0 bg-cream-100 border-2 border-t-0 border-cream-400 z-10">
                {GUIDE_PAGES.map((page) => (
                  <button
                    key={page.id}
                    onClick={() => {
                      setActiveGuidePage(page.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                      activeGuidePage === page.id
                        ? 'text-orange-500 bg-cream-200'
                        : 'text-brown-800 hover:text-orange-500 hover:bg-cream-200'
                    }`}
                  >
                    {page.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Desktop: vertical sidebar */}
          <div className="hidden md:block space-y-1">
            <p className="text-brown-800 text-xs uppercase mb-3 tracking-wide">Guides</p>
            {guidePages.map((page) => (
              <button
                key={page.id}
                onClick={() => setActiveGuidePage(page.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                  activeGuidePage === page.id
                    ? 'text-orange-500 bg-cream-200'
                    : 'text-brown-800 hover:text-orange-500 hover:bg-cream-200'
                }`}
              >
                {page.label}
              </button>
            ))}
            <div className="border-t border-cream-400 my-3" />
            <p className="text-brown-800 text-xs uppercase mb-3 tracking-wide">FAQ</p>
            {faqPages.map((page) => (
              <button
                key={page.id}
                onClick={() => setActiveGuidePage(page.id)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${
                  activeGuidePage === page.id
                    ? 'text-orange-500 bg-cream-200'
                    : 'text-brown-800 hover:text-orange-500 hover:bg-cream-200'
                }`}
              >
                {page.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* Content Area */}
      <div className="max-w-3xl mx-auto w-full">
        <div className="bg-cream-100 border-2 border-cream-400 p-4 md:p-6">
          <h1 className="text-orange-500 text-xl md:text-2xl uppercase tracking-wide mb-4 md:mb-6">
            {currentPage?.heading ?? currentPage?.label}
          </h1>
          {activeGuidePage === 'faq' ? (
            <ActiveContent components={mdxComponents} />
          ) : (
            <div className="prose max-w-none space-y-6 text-brown-800">
              <ActiveContent components={mdxComponents} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
