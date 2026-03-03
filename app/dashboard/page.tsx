'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { ProjectCard } from '../components/projects/ProjectCard';
import { NewProjectCard } from '../components/projects/NewProjectCard';
import { NewProjectModal } from '../components/projects/NewProjectModal';
import { OnboardingTutorial, TutorialHelpButton } from '../components/OnboardingTutorial';
import { RecentJournalEntries } from '../components/RecentJournalEntries';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { QUALIFICATION_BITS_THRESHOLD, isQualified, qualificationProgress } from "@/lib/tiers"
import Link from 'next/link';
import type { Project } from './types';

export default function ProjectsPage() {
  const { data: session, isPending } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    // Check localStorage for cross-page tutorial replay trigger
    if (localStorage.getItem('stasis_replay_tutorial')) {
      localStorage.removeItem('stasis_replay_tutorial');
      setShowTutorial(true);
    }
    // Listen for same-page tutorial replay trigger (user already on /dashboard)
    const handler = () => {
      localStorage.removeItem('stasis_replay_tutorial');
      setShowTutorial(true);
    };
    window.addEventListener('stasis:replay-tutorial', handler);
    return () => window.removeEventListener('stasis:replay-tutorial', handler);
  }, []);
  const [bitsBalance, setBitsBalance] = useState<number | null>(null);

  if (!isPending && !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h1 className="text-brown-800 text-2xl uppercase tracking-wide mb-4">You&apos;re logged out</h1>
        <p className="text-brown-800 mb-6">Do you want to log in?</p>
        <button
          onClick={() => authClient.signIn.oauth2({ providerId: 'hca', callbackURL: '/dashboard' })}
          className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-3 text-sm uppercase tracking-wide transition-colors"
        >
          Log in with Hack Club
        </button>
      </div>
    );
  }

  const fetchProjects = useCallback(async () => {
    try {
      const [projectsRes, currencyRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/currency'),
      ]);
      if (projectsRes.ok) {
        setProjects(await projectsRes.json());
      }
      if (currencyRes.ok) {
        const { bitsBalance } = await currencyRes.json();
        setBitsBalance(bitsBalance);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchProjects();
    } else {
      setLoading(false);
    }
  }, [session, fetchProjects]);

  const handleCreateProject = async (data: {
    title: string
    description: string
    tags: ProjectTag[]
    badges: BadgeType[]
    isStarter: boolean
    starterProjectId: string | null
    githubRepo: string
    tier: number | null
  }) => {
    setModalError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchProjects();
      } else {
        const result = await res.json();
        if (result.error?.includes('already in use')) {
          setModalError("You've already claimed this badge on another project. Please choose a different badge.");
        } else {
          setModalError(result.error || 'Failed to create project');
        }
        return { error: result.error };
      }
    } catch (error) {
      console.error('Failed to create project:', error);
      setModalError('Failed to create project');
      return { error: 'Failed to create project' };
    }
  };

  const totalHoursClaimed = projects.reduce((acc, p) => acc + p.totalHoursClaimed, 0);
  const totalHoursApproved = projects.reduce((acc, p) => acc + p.totalHoursApproved, 0);
  
  const allBadges = projects.flatMap(p => p.badges);
  const approvedBadges = allBadges.filter(b => b.grantedAt !== null);
  const pendingBadges = allBadges.filter(b => b.grantedAt === null);

  const actualBits = bitsBalance ?? 0;
  const qualified = isQualified(actualBits);
  const progress = qualificationProgress(actualBits);

  return (
    <>
      {/* Onboarding Tutorial */}
      <OnboardingTutorial type="dashboard" forceShow={showTutorial} onComplete={() => setShowTutorial(false)} />
      <TutorialHelpButton onClick={() => setShowTutorial(true)} />

      {/* Qualification Progress */}
      <div data-tutorial="badge-progress" className="mb-6 bg-cream-100 border-2 border-cream-400 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-orange-500 text-lg uppercase tracking-wide">progress to qualifying</h2>
            <p className="text-brown-800 text-sm">Earn <span className="text-orange-500 font-medium">{QUALIFICATION_BITS_THRESHOLD}&nbsp;bits</span> from building hardware projects to qualify for Stasis!</p>
          </div>
          {qualified && (
            <p className="text-green-500 text-sm uppercase tracking-wide">✓ Eligible!</p>
          )}
        </div>
        
        {/* Bits Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-brown-800 text-xs uppercase tracking-wide">Bits Earned ({actualBits}/{QUALIFICATION_BITS_THRESHOLD})</p>
            {qualified && <span className="text-green-500 text-xs">✓</span>}
          </div>
          <div className="w-full h-8 bg-cream-200 border-2 border-cream-400 relative overflow-hidden">
            <div 
              className="h-full bg-orange-500 transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xs font-medium ${qualified ? 'text-white' : 'text-brown-800'}`}>
                {actualBits} / {QUALIFICATION_BITS_THRESHOLD}&nbsp;bits
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Journal Entries */}
      <div className="mb-6">
        <RecentJournalEntries />
      </div>

      {/* Stats bar */}
      <div data-tutorial="stats" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex gap-4 sm:gap-6">
          <div>
            <p className="text-brown-800 text-xs uppercase">Projects</p>
            <p className="text-brown-800 text-xl sm:text-2xl">{projects.length}</p>
          </div>
          <div>
            <p className="text-brown-800 text-xs uppercase">Claimed</p>
            <p className="text-brown-800 text-xl sm:text-2xl">~{totalHoursClaimed.toFixed(1)}h</p>
          </div>
          <div>
            <p className="text-brown-800 text-xs uppercase">Approved</p>
            <p className="text-orange-500 text-xl sm:text-2xl">~{totalHoursApproved.toFixed(1)}h</p>
          </div>
        </div>
        <Link
          href="/starter-projects"
          data-tutorial="starter-projects"
          className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 text-sm uppercase tracking-wide transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          Browse Starter Projects
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </Link>
      </div>

      {/* Project Cards Grid */}
      {loading ? (
        <div className="p-8 text-center">
          <p className="text-brown-800">Loading projects...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <NewProjectCard onClick={() => setIsModalOpen(true)} />
          
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
            />
          ))}
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-brown-800">No projects yet. Create your first one!</p>
        </div>
      )}

      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setModalError(null); }}
        onSubmit={handleCreateProject}
        error={modalError}
      />
    </>
  );
}
