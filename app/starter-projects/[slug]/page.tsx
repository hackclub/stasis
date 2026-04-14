'use client';

import { use } from 'react';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { PlatformNoiseOverlay } from '../../components/PlatformNoiseOverlay';
import { projects, type StarterProject } from '../projects';

interface ProjectModule {
  default: React.ComponentType;
  metadata?: {
    title?: string;
    description?: string;
  };
}

const projectModules: Record<string, () => Promise<ProjectModule>> = {
  'spotify-display': () => import('../content/spotify-display.mdx') as Promise<ProjectModule>,
  'blinky': () => import('../content/blinky.mdx') as Promise<ProjectModule>,
  'devboard': () => import('../content/devboard.mdx') as Promise<ProjectModule>,
  'split-keyboard': () => import('../content/split-keyboard.mdx') as Promise<ProjectModule>,
  'squeak': () => import('../content/squeak.mdx') as Promise<ProjectModule>,
};

export default function StarterProjectPage({
  params,
}: Readonly<{
  params: Promise<{ slug: string }>;
}>) {
  const { slug } = use(params);
  const project = projects.find((p: StarterProject) => p.id === slug);

  if (slug === 'pathfinder') {
    redirect('/starter-projects/pathfinder/index.html');
  }

  if (slug === 'hermes') {
    redirect('/starter-projects/hermes/index.html');
  }

  if (!project || !projectModules[slug]) {
    notFound();
  }

  const MDXContent = use(projectModules[slug]()).default;

  return (
    <>
      <div className="min-h-screen bg-[#2A2318] font-mono">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link 
            href="/starter-projects" 
            className="inline-flex items-center text-cream-400 hover:text-orange-500 mb-8 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Starter Projects
          </Link>
          
          <header className="mb-8 pb-6 border-b border-cream-600">
            <h1 className="text-4xl font-bold text-orange-500 mb-2">{project.name}</h1>
            <p className="text-cream-400 text-lg mb-4">{project.short_description}</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-cream-500">~{project.hours} {project.hours === 1 ? 'hour' : 'hours'}</span>
              {project.badges.length > 0 && (
                <div className="flex gap-2">
                  {project.badges.map((badge) => (
                    <span key={badge} className="bg-orange-500/20 text-orange-400 px-2 py-0.5">
                      {badge}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </header>

          <article className="prose prose-invert max-w-none">
            <MDXContent />
          </article>
        </div>

        <footer className="pt-20 pb-24 px-4 bg-gradient-to-b from-transparent to-[#221c14]">
          <div className="mx-auto max-w-md w-max font-mono">
            <p className="text-xs md:text-sm text-cream-300 text-center">Made with <span className="bg-orange-600 text-cream-100">&lt;3</span> by teenagers, for teenagers</p>
            <div className="mt-2 text-cream-300 text-center">
              <a href="https://hackclub.com" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-600 hover:text-cream-100">Hack Club</a>
              <span>・</span>
              <a href="https://hackclub.com/slack" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-600 hover:text-cream-100">Slack</a>
              <span>・</span>
              <a href="https://hackclub.com/clubs" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-600 hover:text-cream-100">Clubs</a>
              <span>・</span>
              <a href="https://hackclub.com/hackathons" target="_blank" rel="noopener" className="underline text-xs md:text-sm hover:bg-orange-600 hover:text-cream-100">Hackathons</a>
            </div>
          </div>
        </footer>
      </div>
      <PlatformNoiseOverlay />
    </>
  );
}
