'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";
import { ProjectCard } from '../components/projects/ProjectCard';
import { NewProjectCard } from '../components/projects/NewProjectCard';
import { NewProjectModal } from '../components/projects/NewProjectModal';
import { OnboardingTutorial, TutorialHelpButton } from '../components/OnboardingTutorial';
import { XPDisplay } from '../components/XPDisplay';
import { RecentJournalEntries } from '../components/RecentJournalEntries';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import Link from 'next/link';
import type { Project } from './types';

export default function ProjectsPage() {
  const { data: session } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

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
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchProjects();
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const totalHoursClaimed = projects.reduce((acc, p) => acc + p.totalHoursClaimed, 0);
  const totalHoursApproved = projects.reduce((acc, p) => acc + p.totalHoursApproved, 0);
  
  const allBadges = projects.flatMap(p => p.badges);
  const approvedBadges = allBadges.filter(b => b.grantedAt !== null);
  const pendingBadges = allBadges.filter(b => b.grantedAt === null);
  const BADGES_REQUIRED = 5;

  return (
    <>
      {/* Onboarding Tutorial */}
      <OnboardingTutorial type="dashboard" forceShow={showTutorial} onComplete={() => setShowTutorial(false)} />
      <TutorialHelpButton onClick={() => setShowTutorial(true)} />

      {/* Badge Progress */}
      <div data-tutorial="badge-progress" className="mb-6 bg-cream-100 border-2 border-cream-400 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-brand-500 text-lg uppercase tracking-wide">Badge Progress</h2>
            <p className="text-cream-800 text-sm">Badges are specific skills or technologies you use in your projects. Earn {BADGES_REQUIRED} approved badges to qualify for Stasis!</p>
          </div>
          {approvedBadges.length >= BADGES_REQUIRED && (
            <p className="text-green-500 text-sm uppercase tracking-wide">✓ Eligible!</p>
          )}
        </div>
        <div className="flex gap-2">
          {Array.from({ length: BADGES_REQUIRED }).map((_, i) => {
            const isApproved = i < approvedBadges.length;
            const isPending = !isApproved && i < approvedBadges.length + pendingBadges.length;
            return (
              <div
                key={i}
                className={`flex-1 h-10 border-2 transition-all duration-300 flex items-center justify-center ${
                  isApproved
                    ? 'bg-brand-500 border-brand-400'
                    : isPending
                    ? 'bg-brand-500/20 border-brand-500/50 border-dashed'
                    : 'bg-cream-200 border-cream-400'
                }`}
              >
                {isApproved && (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-white">
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
          <p className="text-cream-800 text-xs mt-2">{pendingBadges.length} badge{pendingBadges.length > 1 ? 's' : ''} pending approval</p>
        )}
      </div>

      {/* XP Progress */}
      <div data-tutorial="xp-progress" className="mb-6">
        <XPDisplay />
      </div>

      {/* Recent Journal Entries */}
      <div className="mb-6">
        <RecentJournalEntries />
      </div>

      {/* Stats bar */}
      <div data-tutorial="stats" className="flex items-center justify-between mb-6">
        <div className="flex gap-6">
          <div>
            <p className="text-cream-800 text-xs uppercase">Projects</p>
            <p className="text-cream-800 text-2xl">{projects.length}</p>
          </div>
          <div>
            <p className="text-cream-800 text-xs uppercase">Claimed</p>
            <p className="text-cream-800 text-2xl">~{totalHoursClaimed.toFixed(1)}h</p>
          </div>
          <div>
            <p className="text-cream-800 text-xs uppercase">Approved</p>
            <p className="text-brand-500 text-2xl">~{totalHoursApproved.toFixed(1)}h</p>
          </div>
        </div>
        <Link
          href="/starter-projects"
          data-tutorial="starter-projects"
          className="bg-brand-500 hover:bg-brand-400 text-white px-4 py-2 text-sm uppercase tracking-wide transition-colors flex items-center gap-2"
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
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateProject}
      />
    </>
  );
}
