'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { ProjectCard } from '../components/projects/ProjectCard';
import { NewProjectCard } from '../components/projects/NewProjectCard';
import { NewProjectModal } from '../components/projects/NewProjectModal';
import { OnboardingTutorial, TutorialHelpButton } from '../components/OnboardingTutorial';
import { XPDisplay } from '../components/XPDisplay';
import { CurrencyDisplay } from '../components/CurrencyDisplay';
import { RecentJournalEntries } from '../components/RecentJournalEntries';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import Link from 'next/link';
import type { Project } from './types';

export default function ProjectsPage() {
  const { data: session, isPending } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  if (!isPending && !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h1 className="text-cream-800 text-2xl uppercase tracking-wide mb-4">You&apos;re logged out</h1>
        <p className="text-cream-700 mb-6">Do you want to log in?</p>
        <button
          onClick={() => authClient.signIn.oauth2({ providerId: 'hca', callbackURL: '/dashboard' })}
          className="bg-brand-500 hover:bg-brand-400 text-white px-6 py-3 text-sm uppercase tracking-wide transition-colors"
        >
          Log in with Hack Club
        </button>
      </div>
    );
  }

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
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
  const BADGES_REQUIRED = 5;
  const HOURS_REQUIRED = 10;
  const badgesComplete = approvedBadges.length >= BADGES_REQUIRED;
  const hoursComplete = totalHoursApproved >= HOURS_REQUIRED;

  return (
    <>
      {/* Onboarding Tutorial */}
      <OnboardingTutorial type="dashboard" forceShow={showTutorial} onComplete={() => setShowTutorial(false)} />
      <TutorialHelpButton onClick={() => setShowTutorial(true)} />

      {/* Qualification Progress */}
      <div data-tutorial="badge-progress" className="mb-6 bg-cream-100 border-2 border-cream-400 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-brand-500 text-lg uppercase tracking-wide">progress to qualifying</h2>
            <p className="text-cream-800 text-sm">Earn {BADGES_REQUIRED} approved badges AND spend {HOURS_REQUIRED} hours building projects to qualify for Stasis!</p>
          </div>
          {badgesComplete && hoursComplete && (
            <p className="text-green-500 text-sm uppercase tracking-wide">✓ Eligible!</p>
          )}
        </div>
        
        {/* Badge Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-cream-700 text-xs uppercase tracking-wide">Badges ({approvedBadges.length}/{BADGES_REQUIRED})</p>
            {badgesComplete && <span className="text-green-500 text-xs">✓</span>}
          </div>
          <div className="flex gap-2">
            {Array.from({ length: BADGES_REQUIRED }).map((_, i) => {
              const isApproved = i < approvedBadges.length;
              const isPending = !isApproved && i < approvedBadges.length + pendingBadges.length;
              return (
                <div
                  key={i}
                  className={`flex-1 h-8 border-2 transition-all duration-300 flex items-center justify-center ${
                    isApproved
                      ? 'bg-brand-500 border-brand-400'
                      : isPending
                      ? 'bg-brand-500/20 border-brand-500/50 border-dashed'
                      : 'bg-cream-200 border-cream-400'
                  }`}
                >
                  {isApproved && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {isPending && (
                    <span className="text-brand-500 text-xs uppercase">?</span>
                  )}
                </div>
              );
            })}
          </div>
          {pendingBadges.length > 0 && (
            <p className="text-cream-800 text-xs mt-1">{pendingBadges.length} badge{pendingBadges.length > 1 ? 's' : ''} pending approval</p>
          )}
        </div>

        {/* Hours Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-cream-700 text-xs uppercase tracking-wide">Build Hours ({totalHoursApproved.toFixed(1)}/{HOURS_REQUIRED}h)</p>
            {hoursComplete && <span className="text-green-500 text-xs">✓</span>}
          </div>
          <div className="w-full h-8 bg-cream-200 border-2 border-cream-400 relative overflow-hidden">
            <div 
              className="h-full bg-brand-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (totalHoursApproved / HOURS_REQUIRED) * 100)}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xs font-medium ${hoursComplete ? 'text-white' : 'text-cream-700'}`}>
                {totalHoursApproved.toFixed(1)}h / {HOURS_REQUIRED}h
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* XP Progress */}
      <div data-tutorial="xp-progress" className="mb-6">
        <XPDisplay />
      </div>

      {/* Currency Balance */}
      <div className="mb-6">
        <CurrencyDisplay />
      </div>

      {/* Recent Journal Entries */}
      <div className="mb-6">
        <RecentJournalEntries />
      </div>

      {/* Stats bar */}
      <div data-tutorial="stats" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex gap-4 sm:gap-6">
          <div>
            <p className="text-cream-800 text-xs uppercase">Projects</p>
            <p className="text-cream-800 text-xl sm:text-2xl">{projects.length}</p>
          </div>
          <div>
            <p className="text-cream-800 text-xs uppercase">Claimed</p>
            <p className="text-cream-800 text-xl sm:text-2xl">~{totalHoursClaimed.toFixed(1)}h</p>
          </div>
          <div>
            <p className="text-cream-800 text-xs uppercase">Approved</p>
            <p className="text-brand-500 text-xl sm:text-2xl">~{totalHoursApproved.toFixed(1)}h</p>
          </div>
        </div>
        <Link
          href="/starter-projects"
          data-tutorial="starter-projects"
          className="bg-brand-500 hover:bg-brand-400 text-white px-4 py-2 text-sm uppercase tracking-wide transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
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
          <p className="text-cream-800">Loading projects...</p>
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
          <p className="text-cream-800">No projects yet. Create your first one!</p>
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
