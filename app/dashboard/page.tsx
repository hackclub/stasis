'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { ProjectCard } from '../components/projects/ProjectCard';
import { NewProjectCard } from '../components/projects/NewProjectCard';
import { NewProjectModal } from '../components/projects/NewProjectModal';
import { OnboardingTutorial } from '../components/OnboardingTutorial';
import { PronounsModal } from '../components/PronounsModal';
import { EventPicker } from '../components/EventPicker';
import { RecentJournalEntries } from '../components/RecentJournalEntries';
import { UpcomingEvents } from '../components/UpcomingEvents';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { QUALIFICATION_BITS_THRESHOLD, isQualified, qualificationProgress, getEventThreshold, EVENT_LABELS, type EventPreference } from "@/lib/tiers"
import Link from 'next/link';
import type { Project } from './types';

export default function ProjectsPage() {
  const { data: session, isPending } = useSession();
  const searchParams = useSearchParams();
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
  const [eventPreference, setEventPreference] = useState<EventPreference>('stasis');
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<EventPreference | null>(null);
  const [userPronouns, setUserPronouns] = useState<string | null>(null);
  const [showPronounsModal, setShowPronounsModal] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const [projectsRes, currencyRes, eventPrefRes, pronounsRes, tutorialRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/currency'),
        fetch('/api/user/event-preference'),
        fetch('/api/user/pronouns'),
        fetch('/api/user/tutorial'),
      ]);
      if (projectsRes.ok) {
        setProjects(await projectsRes.json());
      }
      if (currencyRes.ok) {
        const { bitsBalance } = await currencyRes.json();
        setBitsBalance(bitsBalance);
      }
      if (eventPrefRes.ok) {
        const { event } = await eventPrefRes.json();
        if (event === 'stasis' || event === 'opensauce') {
          setEventPreference(event);
        } else {
          // No preference stored yet — check if user arrived from /opensauce signup
          const signupPage = searchParams.get('signupPage');
          if (signupPage) {
            const pref = signupPage === 'Open Sauce' ? 'opensauce' as const : 'stasis' as const;
            setEventPreference(pref);
            fetch('/api/user/event-preference', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: pref }),
            });
          }
        }
      }
      // Show pronouns modal if tutorial is already done and pronouns not set
      let fetchedPronouns: string | null = null;
      if (pronounsRes.ok) {
        const data = await pronounsRes.json();
        fetchedPronouns = data.pronouns;
        setUserPronouns(fetchedPronouns);
      }
      if (tutorialRes.ok) {
        const { tutorialDashboard } = await tutorialRes.json();
        if (tutorialDashboard && fetchedPronouns === null) {
          setShowPronounsModal(true);
        }
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
        const project = await res.json();
        fetchProjects();
        return { projectId: project.id };
      } else {
        const result = await res.json();
        setModalError(result.error || 'Failed to create project');
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
  const eventThreshold = getEventThreshold(eventPreference);
  const qualified = actualBits >= eventThreshold;
  const progress = Math.min(1, actualBits / eventThreshold);

  const openEventPicker = () => {
    setPickerSelection(eventPreference);
    setShowEventPicker(true);
  };

  const confirmEventChange = () => {
    if (!pickerSelection || pickerSelection === eventPreference) {
      setShowEventPicker(false);
      return;
    }
    setEventPreference(pickerSelection);
    fetch('/api/user/event-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: pickerSelection }),
    });
    setShowEventPicker(false);
  };

  return (
    <>
      {/* Onboarding Tutorial */}
      <OnboardingTutorial type="dashboard" forceShow={showTutorial} onComplete={() => { setShowTutorial(false); if (userPronouns === null) setShowPronounsModal(true); }} onEventChange={(event) => setEventPreference(event)} initialEvent={eventPreference} />


      {/* Qualification Progress */}
      <div data-tutorial="badge-progress" className="mb-6 bg-cream-100 border-2 border-cream-400 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-orange-500 text-lg uppercase tracking-wide">progress to qualifying for {EVENT_LABELS[eventPreference]}</h2>
            <p className="text-brown-800 text-sm">Earn <span className="text-orange-500 font-medium">{eventThreshold}&nbsp;bits</span> from building hardware projects to qualify for {EVENT_LABELS[eventPreference]}!</p>
          </div>
          <div className="flex items-center gap-3">
            {qualified && (
              <p className="text-green-500 text-sm uppercase tracking-wide whitespace-nowrap">✓ Eligible!</p>
            )}
            <button
              type="button"
              onClick={openEventPicker}
              className="shrink-0 border-2 border-cream-400 bg-cream-200 hover:bg-cream-300 px-3 py-1.5 text-xs uppercase tracking-wide text-brown-800 cursor-pointer transition-colors whitespace-nowrap"
            >
              Switch event
            </button>
          </div>
        </div>

        {/* Bits Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-brown-800 text-xs uppercase tracking-wide">Bits Earned ({actualBits}/{eventThreshold})</p>
            {qualified && <span className="text-green-500 text-xs">✓</span>}
          </div>
          <div className="w-full h-8 bg-cream-200 border-2 border-cream-400 relative overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all duration-500"
              style={{ width: `${progress * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-xs font-medium ${qualified ? 'text-white' : 'text-brown-800'}`}>
                {actualBits} / {eventThreshold}&nbsp;bits
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Journal Entries & Upcoming Events */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <RecentJournalEntries />
        <UpcomingEvents />
      </div>

      {/* Stats bar */}
      <div data-tutorial="stats" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex gap-4 sm:gap-6">
          <div>
            <p className="text-brown-800 text-xs uppercase">Hours Logged</p>
            <p className="text-brown-800 text-xl sm:text-2xl">~{totalHoursClaimed.toFixed(1)}h</p>
          </div>
          <div>
            <p className="text-brown-800 text-xs uppercase">Hours Approved</p>
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

      {showPronounsModal && (
        <PronounsModal onComplete={() => setShowPronounsModal(false)} />
      )}

      {/* Event change confirmation dialog */}
      {showEventPicker && (
        <div className="fixed inset-0 z-50 flex items-start justify-center">
          <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => setShowEventPicker(false)} />
          <div className="relative top-4 bg-cream-100 border-2 border-brown-800 p-6 max-w-[780px] w-[95vw] mx-4 shadow-lg overflow-y-auto max-h-[calc(100vh-2rem)]">
            
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-brown-800 text-lg uppercase tracking-wide">Pick Your Event</h3>
            <button
              onClick={() => setShowEventPicker(false)}
              className=" w-10 h-10 flex items-center justify-center bg-cream-100 border border-cream-600 text-brown-800 hover:text-orange-500 text-lg leading-none cursor-pointer transition-colors"
            >
              &times;
            </button>
            </div>
           
            <p className="text-brown-800 text-sm leading-relaxed mb-5">
              Pick which event you want to work toward. You can switch at any time, and if you buy a ticket for one event, you can keep earning bits to qualify for the other one too!
            </p>

            <EventPicker selectedEvent={pickerSelection} onSelect={setPickerSelection} />

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowEventPicker(false)}
                className="flex-1 bg-cream-300 hover:bg-cream-400 px-4 py-2 text-center cursor-pointer transition-colors"
              >
                <span className="text-brown-800 uppercase tracking-wide text-sm">Cancel</span>
              </button>
              <button
                onClick={confirmEventChange}
                disabled={!pickerSelection}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-center cursor-pointer transition-colors"
              >
                <span className="text-cream-100 uppercase tracking-wide text-sm">Confirm</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
