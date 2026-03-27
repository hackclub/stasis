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
import { GoalPicker } from '../components/GoalPicker';
import { PrizeGoalPicker } from '../components/PrizeGoalPicker';
import { AnimatedResize } from '../components/AnimatedResize';
import { RecentJournalEntries } from '../components/RecentJournalEntries';
import { UpcomingEvents } from '../components/UpcomingEvents';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { getGoalThreshold, GOAL_LABELS, type GoalPreference } from "@/lib/tiers"
import Link from 'next/link';
import type { Project } from './types';

interface GoalPrize {
  id: string;
  shopItemId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  description: string;
}

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
  const [pendingBits, setPendingBits] = useState<number>(0);
  const [goalPreference, setGoalPreference] = useState<GoalPreference>('stasis');
  const [goalPrizes, setGoalPrizes] = useState<GoalPrize[]>([]);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [goalPickerMode, setGoalPickerMode] = useState<'goal' | 'prizes'>('goal');
  const [pickerSelection, setPickerSelection] = useState<GoalPreference | null>(null);
  const [userPronouns, setUserPronouns] = useState<string | null>(null);
  const [showPronounsModal, setShowPronounsModal] = useState(false);
  const [hoveredPrizeId, setHoveredPrizeId] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<'confirmed' | 'pending' | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const [projectsRes, currencyRes, goalPrefRes, pronounsRes, tutorialRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/currency'),
        fetch('/api/user/goal-preference'),
        fetch('/api/user/pronouns'),
        fetch('/api/user/tutorial'),
      ]);
      if (projectsRes.ok) {
        setProjects(await projectsRes.json());
      }
      if (currencyRes.ok) {
        const { bitsBalance, pendingBits: pending } = await currencyRes.json();
        setBitsBalance(bitsBalance);
        setPendingBits(pending ?? 0);
      }
      if (goalPrefRes.ok) {
        const { goal, goalPrizes: prizes } = await goalPrefRes.json();
        if (goal === 'stasis' || goal === 'opensauce' || goal === 'prizes') {
          setGoalPreference(goal);
          if (prizes) setGoalPrizes(prizes);
        } else {
          // No preference stored yet — check if user arrived from /opensauce signup
          const signupPage = searchParams.get('signupPage');
          if (signupPage) {
            const pref = signupPage === 'Open Sauce' ? 'opensauce' as const : 'stasis' as const;
            setGoalPreference(pref);
            fetch('/api/user/goal-preference', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ goal: pref }),
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
  const confirmedBits = actualBits - pendingBits;

  // Progress bar calculations
  const isPrizesGoal = goalPreference === 'prizes';
  const sortedPrizes = [...goalPrizes].sort((a, b) => a.price - b.price);
  const maxPrize = sortedPrizes.length > 0 ? sortedPrizes[sortedPrizes.length - 1] : null;
  const nextUnaffordablePrize = sortedPrizes.find(p => p.price > actualBits);

  const goalThreshold = isPrizesGoal
    ? (maxPrize?.price ?? 0)
    : getGoalThreshold(goalPreference);
  const qualified = actualBits >= goalThreshold && goalThreshold > 0;
  const progress = goalThreshold > 0 ? Math.min(1, actualBits / goalThreshold) : 0;
  const confirmedProgress = goalThreshold > 0 ? Math.min(1, confirmedBits / goalThreshold) : 0;

  const openGoalPicker = () => {
    setPickerSelection(goalPreference);
    setGoalPickerMode('goal');
    setShowGoalPicker(true);
  };

  const confirmGoalChange = () => {
    if (!pickerSelection) {
      setShowGoalPicker(false);
      return;
    }
    if (pickerSelection === 'prizes') {
      // Switch to prize picker mode (even if already on prizes — user wants to edit)
      setGoalPickerMode('prizes');
      return;
    }
    if (pickerSelection === goalPreference) {
      setShowGoalPicker(false);
      return;
    }
    setGoalPreference(pickerSelection);
    fetch('/api/user/goal-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: pickerSelection }),
    });
    setShowGoalPicker(false);
  };

  const handleModalPrizeConfirm = (prizeIds: string[]) => {
    // Save prizes goal
    fetch('/api/user/goal-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'prizes', goalPrizeIds: prizeIds }),
    }).then(() => {
      // Refetch goal prizes to get full item details
      fetch('/api/user/goal-preference')
        .then(res => res.json())
        .then(({ goalPrizes: prizes }) => {
          if (prizes) setGoalPrizes(prizes);
        });
    });
    setGoalPreference('prizes');
    setShowGoalPicker(false);
  };

  // Compute progress bar title and subtitle for prizes
  let progressTitle: string;
  let progressSubtitle: React.ReactNode;
  if (isPrizesGoal && maxPrize) {
    progressTitle = `progress to ${maxPrize.name}`;
    if (nextUnaffordablePrize) {
      const bitsToGo = nextUnaffordablePrize.price - actualBits;
      progressSubtitle = (
        <>You have <span className="text-orange-500 font-medium">{bitsToGo.toLocaleString()}&nbsp;bits</span> to go until {nextUnaffordablePrize.name}!</>
      );
    } else {
      progressSubtitle = 'You can afford all your selected prizes!';
    }
  } else if (isPrizesGoal) {
    progressTitle = 'progress to prizes';
    progressSubtitle = 'Select prizes to track your progress!';
  } else {
    progressTitle = `progress to qualifying for ${GOAL_LABELS[goalPreference]}`;
    progressSubtitle = (
      <>Earn <span className="text-orange-500 font-medium">{goalThreshold}&nbsp;{goalPreference === 'stasis' ? 'pending bits' : 'bits'}</span> from building hardware projects to qualify for {GOAL_LABELS[goalPreference]}!</>
    );
  }

  return (
    <>
      {/* Onboarding Tutorial */}
      <OnboardingTutorial
        type="dashboard"
        forceShow={showTutorial}
        onComplete={() => { setShowTutorial(false); if (userPronouns === null) setShowPronounsModal(true); }}
        onGoalChange={(goal) => setGoalPreference(goal)}
        onGoalPrizesChange={() => {
          // Set prizes goal immediately, then refetch for full prize details
          setGoalPreference('prizes');
          fetch('/api/user/goal-preference')
            .then(res => res.json())
            .then(({ goal, goalPrizes: prizes }) => {
              if (goal) setGoalPreference(goal);
              if (prizes) setGoalPrizes(prizes);
            });
        }}
        initialGoal={goalPreference}
      />


      {/* Qualification Progress */}
      <div data-tutorial="badge-progress" className="mb-6 bg-cream-100 border-2 border-cream-400 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-orange-500 text-lg uppercase tracking-wide">{progressTitle}</h2>
            <p className="text-brown-800 text-sm">{progressSubtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {qualified && (
              <p className="text-green-500 text-sm uppercase tracking-wide whitespace-nowrap">✓ Eligible!</p>
            )}
            <button
              type="button"
              onClick={openGoalPicker}
              className="shrink-0 border-2 border-cream-400 bg-cream-200 hover:bg-cream-300 px-3 py-1.5 text-xs uppercase tracking-wide text-brown-800 cursor-pointer transition-colors whitespace-nowrap"
            >
              Switch goal
            </button>
          </div>
        </div>

        {/* Bits Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-brown-800 text-xs uppercase tracking-wide">
                Bits Earned ({goalPreference === 'stasis' ? actualBits : confirmedBits}/{goalThreshold})
              </p>
              {pendingBits > 0 && (
                <p className="text-cream-600 text-xs">{pendingBits.toLocaleString()} bits pending build review</p>
              )}
            </div>
            {qualified && <span className="text-green-500 text-xs">✓</span>}
          </div>
          <div className={`relative ${isPrizesGoal && sortedPrizes.length > 0 ? 'mr-[20px]' : ''}`}>
            <div className="h-8 bg-cream-200 border-2 border-cream-400 relative overflow-hidden">
              {/* Confirmed bits (orange) */}
              {confirmedBits > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-orange-500 transition-all duration-500 z-[1] cursor-default"
                  style={{ width: `${confirmedProgress * 100}%` }}
                  onMouseEnter={() => setHoveredSegment('confirmed')}
                  onMouseLeave={() => setHoveredSegment(null)}
                />
              )}
              {/* Pending bits (diagonal orange stripes) */}
              {pendingBits > 0 && (
                <div
                  className="absolute inset-y-0 transition-all duration-500 z-[1] cursor-default"
                  style={{
                    left: `${confirmedProgress * 100}%`,
                    width: `${(progress - confirmedProgress) * 100}%`,
                    backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, var(--color-orange-500) 4px, var(--color-orange-500) 8px)',
                    opacity: 0.4,
                  }}
                  onMouseEnter={() => setHoveredSegment('pending')}
                  onMouseLeave={() => setHoveredSegment(null)}
                />
              )}
              {/* Vertical marker lines inside the bar for each prize */}
              {isPrizesGoal && sortedPrizes.length > 0 && goalThreshold > 0 && sortedPrizes.map((prize) => {
                const pct = (prize.price / goalThreshold) * 100;
                const filled = actualBits >= prize.price;
                return (
                  <div
                    key={`tick-${prize.shopItemId}`}
                    className="absolute top-0 h-full pointer-events-none"
                    style={{
                      left: `${Math.min(pct, 100)}%`,
                      width: '2px',
                      transform: 'translateX(-50%)',
                      backgroundColor: filled ? 'rgba(255,255,255,0.7)' : 'var(--color-orange-500)',
                    }}
                  />
                );
              })}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[2]">
                <span className={`text-xs font-medium ${qualified ? 'text-white' : 'text-brown-800'}`}>
                  {goalPreference === 'stasis' ? actualBits : confirmedBits} / {goalThreshold}&nbsp;bits
                </span>
              </div>
            </div>

            {/* Segment tooltip (outside overflow-hidden bar) */}
            {hoveredSegment && (
              <div
                className="absolute z-30 pointer-events-none"
                style={{
                  bottom: '100%',
                  left: hoveredSegment === 'confirmed'
                    ? `${(confirmedProgress / 2) * 100}%`
                    : `${(confirmedProgress + (progress - confirmedProgress) / 2) * 100}%`,
                  transform: 'translateX(-50%)',
                  marginBottom: '8px',
                }}
              >
                <div className="bg-brown-800 text-cream-100 border-2 border-cream-400 px-3 py-2 whitespace-nowrap">
                  <div className="text-xs font-bold">
                    {hoveredSegment === 'confirmed'
                      ? `${confirmedBits.toLocaleString()} Bits Approved`
                      : `${pendingBits.toLocaleString()} Bits Pending Build Review`
                    }
                  </div>
                </div>
              </div>
            )}

            {/* Prize squares on progress bar */}
            {isPrizesGoal && sortedPrizes.length > 0 && goalThreshold > 0 && sortedPrizes.map((prize) => {
              const isMax = prize.shopItemId === maxPrize?.shopItemId;
              const canAfford = actualBits >= prize.price;
              const leftPercent = (prize.price / goalThreshold) * 100;
              const size = isMax ? 40 : 24;
              return (
                <div
                  key={prize.shopItemId}
                  className="absolute"
                  style={{
                    left: `${Math.min(leftPercent, 100)}%`,
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: hoveredPrizeId === prize.shopItemId ? 20 : isMax ? 10 : 5,
                  }}
                  onMouseEnter={() => setHoveredPrizeId(prize.shopItemId)}
                  onMouseLeave={() => setHoveredPrizeId(null)}
                >
                  <div
                    className={`border-2 bg-cream-100 overflow-hidden cursor-pointer transition-colors p-1 ${
                      canAfford ? 'border-orange-500' : 'border-cream-400'
                    }`}
                    style={{ width: size, height: size }}
                  >
                    {prize.imageUrl ? (
                      <img src={prize.imageUrl} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full bg-cream-200" />
                    )}
                  </div>

                  {/* Tooltip */}
                  {hoveredPrizeId === prize.shopItemId && (
                    <div
                      className="absolute z-30 pointer-events-none"
                      style={{
                        bottom: `${size + 8}px`,
                        left: '50%',
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <div className="bg-brown-800 text-cream-100 border-2 border-cream-400 px-3 py-2 w-[200px]">
                        <div className="text-xs font-bold leading-tight">{prize.name}</div>
                        <div className="text-[10px] leading-snug mt-0.5 opacity-80">{prize.description}</div>
                        <div className="text-xs font-bold text-orange-400 mt-1">{prize.price.toLocaleString()}&nbsp;Bits</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty state for prizes with no selection */}
            {isPrizesGoal && goalPrizes.length === 0 && (
              <div className="mt-2 text-center">
                <button
                  onClick={() => {
                    setPickerSelection('prizes');
                    setGoalPickerMode('prizes');
                    setShowGoalPicker(true);
                  }}
                  className="text-orange-500 hover:text-orange-400 text-xs uppercase tracking-wide underline cursor-pointer"
                >
                  Select prizes to track
                </button>
              </div>
            )}
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

      {/* Goal change confirmation dialog */}
      {showGoalPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => setShowGoalPicker(false)} />
          <AnimatedResize className="relative bg-cream-100 border-2 border-brown-800 shadow-lg mx-4" duration={200}>
            <div className={`p-6 overflow-y-auto max-h-[calc(100vh-2rem)] ${goalPickerMode === 'goal' ? 'w-[min(1160px,95vw)]' : 'w-[min(780px,95vw)]'}`}>
              {goalPickerMode === 'goal' ? (
                <>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-brown-800 text-lg uppercase tracking-wide">Pick Your Goal</h3>
                    <button
                      onClick={() => setShowGoalPicker(false)}
                      className="w-10 h-10 flex items-center justify-center bg-cream-100 border border-cream-600 text-brown-800 hover:text-orange-500 text-lg leading-none cursor-pointer transition-colors"
                    >
                      &times;
                    </button>
                  </div>

                  <p className="text-brown-800 text-sm leading-relaxed mb-5">
                    Pick which goal you want to work toward. You can switch at any time, and if you buy a ticket for one event, you can keep earning bits to qualify for the other one too!
                  </p>

                  <GoalPicker selectedGoal={pickerSelection} onSelect={setPickerSelection} />

                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={() => setShowGoalPicker(false)}
                      className="flex-1 bg-cream-300 hover:bg-cream-400 px-4 py-2 text-center cursor-pointer transition-colors"
                    >
                      <span className="text-brown-800 uppercase tracking-wide text-sm">Cancel</span>
                    </button>
                    <button
                      onClick={confirmGoalChange}
                      disabled={!pickerSelection}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-center cursor-pointer transition-colors"
                    >
                      <span
                        key={pickerSelection === 'prizes' ? 'pick-prizes' : 'confirm'}
                        className="text-cream-100 uppercase tracking-wide text-sm inline-block animate-[flicker_0.3s_ease-in-out]"
                      >
                        {pickerSelection === 'prizes' ? 'Pick Prizes' : 'Confirm'}
                      </span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-brown-800 text-lg uppercase tracking-wide">Pick Your Prizes</h3>
                    <button
                      onClick={() => setShowGoalPicker(false)}
                      className="w-10 h-10 flex items-center justify-center bg-cream-100 border border-cream-600 text-brown-800 hover:text-orange-500 text-lg leading-none cursor-pointer transition-colors"
                    >
                      &times;
                    </button>
                  </div>

                  <PrizeGoalPicker
                    initialSelection={goalPrizes.map(p => p.shopItemId)}
                    onConfirm={handleModalPrizeConfirm}
                    onBack={() => setGoalPickerMode('goal')}
                  />
                </>
              )}
            </div>
          </AnimatedResize>
        </div>
      )}
    </>
  );
}
