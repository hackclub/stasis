'use client';

import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react';
import { GoalPicker } from './GoalPicker';
import { PrizeGoalPicker } from './PrizeGoalPicker';
import { AnimatedResize } from './AnimatedResize';
import type { GoalPreference } from '@/lib/tiers';

interface TutorialStep {
  id: string;
  title: string;
  content: string;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: 'click' | 'wait';
}

export type TutorialType = 'dashboard' | 'project';

function renderContent(content: string) {
  const lines = content.split('\n');
  return lines.flatMap((line, lineIndex) => {
    const parts = line.split(/(\b\d+\s+bits?\b|\bbits?\b)/gi);
    const rendered = parts.map((part, i) =>
      /^(\d+\s+bits?|bits?)$/i.test(part)
        ? <span key={`${lineIndex}-${i}`} className="text-orange-500 font-medium">{part.replace(/(\d+)\s+(bits?)/i, '$1\u00A0$2')}</span>
        : part
    );
    if (lineIndex < lines.length - 1) {
      rendered.push(<br key={`br-${lineIndex}`} />);
    }
    return rendered;
  });
}

interface TutorialStatus {
  tutorialDashboard: boolean;
  tutorialProject: boolean;
}

const DASHBOARD_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Stasis!',
    content: 'Stasis is where you design and build hardware projects, earn bits, and work toward a goal. Each project has a complexity level that determines how many bits you earn. Let\'s get you started!',
    position: 'center',
  },
  {
    id: 'pick-goal',
    title: 'Pick Your Goal',
    content: '',
    position: 'center',
  },
  // 'pick-prizes' step is dynamically inserted after 'pick-goal' when prizes goal is selected
  {
    id: 'badge-progress',
    title: 'Your Goal',
    content: 'To qualify, you need to earn enough bits from completing hardware projects.\n\nEach project has a complexity level with a fixed reward - you get a budget to spend on parts for your project, and you earn bits based on how much money you have left over.\n\nAccumulate enough bits and you\'re in!',
    targetSelector: '[data-tutorial="badge-progress"]',
    position: 'bottom',
  },
  {
    id: 'stats',
    title: 'Track Your Hours',
    content: 'Log your hours by writing detailed journal entries. Each complexity level has a rough hour range for how long the project will take — higher complexity levels mean bigger projects and more bits!',
    targetSelector: '[data-tutorial="stats"]',
    position: 'bottom',
  },
  {
    id: 'starter-projects',
    title: 'Need Ideas?',
    content: 'Browse starter projects for inspiration. These are project guides written by experts; you can follow them yourself or use them as a starting point for your own ideas.',
    targetSelector: '[data-tutorial="starter-projects"]',
    position: 'bottom',
  },
  {
    id: 'new-project',
    title: 'Create Your First Project',
    content: 'Click here to start a new project. Give it a name, pick a complexity level, add badges, and choose the technologies you\'ll use. Don\'t worry — you can always delete it later.',
    targetSelector: '[data-tutorial="new-project"]',
    position: 'right',
  },
  {
    id: 'done-dashboard',
    title: 'You\'re Ready!',
    content: 'Create a project to continue. Once you\'re in a project, you\'ll learn about the design and build stages, logging work, and submitting for review.',
    position: 'center',
  },
];

const PROJECT_STEPS: TutorialStep[] = [
  {
    id: 'project-welcome',
    title: 'Your Project Dashboard',
    content: 'This is where you\'ll manage your project. Let\'s walk through how to complete and submit your work.',
    position: 'center',
  },
  {
    id: 'stage-progress',
    title: 'Two Stages: Design & Build',
    content: 'Every project has two stages. First, complete the Design stage (plan your project), then move to Build (make it real).',
    targetSelector: '[data-tutorial="stage-progress"]',
    position: 'bottom',
  },
  {
    id: 'github',
    title: 'Link Your GitHub Repo',
    content: 'Create a GitHub repo for your project and link it here. Include your code, schematics, CAD files, and documentation.',
    targetSelector: '[data-tutorial="github"]',
    position: 'bottom',
  },
  {
    id: 'badges',
    title: 'Claim Skill Badges',
    content: 'Select badges for skills you\'ll demonstrate. Working with I2C? Claim it! Designing a PCB? Claim that too! They\'re verified during review.',
    targetSelector: '[data-tutorial="badges"]',
    position: 'bottom',
  },
  {
    id: 'bom',
    title: 'Bill of Materials',
    content: 'List every part you need with costs and links. Your project\'s complexity level determines its bit allocation (1 bit = $1). Once your design is approved, you\'ll receive a grant card to purchase materials.',
    targetSelector: '[data-tutorial="bom"]',
    position: 'top',
  },
  {
    id: 'actions',
    title: 'Journal your progress',
    content: 'Make a journal entry every time you work on your project. Add photos, describe what you did, and estimate hours.',
    targetSelector: '[data-tutorial="actions"]',
    position: 'top',
  },
  {
    id: 'timelapse',
    title: 'Record a Timelapse',
    content: 'Planning a 7+ hour session? Start a timelapse recording before you begin. This is recommended for longer work sessions.',
    targetSelector: '[data-tutorial="timelapse"]',
    position: 'bottom',
  },
  {
    id: 'submit',
    title: 'Submit for Review',
    content: 'When you\'ve completed all requirements, the green "Submit" button appears. Click it to send your work for review. Reviewers will approve or give feedback.',
    targetSelector: '[data-tutorial="submit"]',
    position: 'top',
  },
  {
    id: 'timeline',
    title: 'Your Activity Timeline',
    content: 'Everything you do is tracked here — sessions, reviews, status changes. It\'s your project\'s complete history.',
    targetSelector: '[data-tutorial="timeline"]',
    position: 'top',
  },
  {
    id: 'done-project',
    title: 'Go Build Something Cool!',
    content: 'Start by editing your project to add a description and GitHub link. Then add BOM items and log your first work session!',
    position: 'center',
  },
];

interface Props {
  type: TutorialType;
  forceShow?: boolean;
  onComplete?: () => void;
  onGoalChange?: (goal: GoalPreference) => void;
  onGoalPrizesChange?: (prizeIds: string[]) => void;
  badgeCount?: number;
  initialGoal?: GoalPreference | null;
}

export function OnboardingTutorial({ type, forceShow = false, onComplete, onGoalChange, onGoalPrizesChange, badgeCount = 0, initialGoal = null }: Readonly<Props>) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<GoalPreference | null>(initialGoal);
  const [selectedPrizeIds, setSelectedPrizeIds] = useState<string[]>([]);
  const hasManuallySelected = useRef(false);
  const wrappedSetSelectedGoal = useCallback((goal: GoalPreference) => {
    hasManuallySelected.current = true;
    setSelectedGoal(goal);
  }, []);
  const hasFetched = useRef(false);

  // Sync initialGoal when it arrives asynchronously (e.g. after API fetch)
  useEffect(() => {
    if (initialGoal && !hasManuallySelected.current) {
      setSelectedGoal(initialGoal); // eslint-disable-line react-hooks/set-state-in-effect -- sync prop to state
    }
  }, [initialGoal]);

  const TUTORIAL_STEPS = useMemo(() => {
    let baseSteps = type === 'dashboard' ? DASHBOARD_STEPS : PROJECT_STEPS;

    // Dynamically insert 'pick-prizes' step after 'pick-goal' when prizes goal is selected
    if (type === 'dashboard' && selectedGoal === 'prizes') {
      const goalStepIdx = baseSteps.findIndex(s => s.id === 'pick-goal');
      if (goalStepIdx !== -1) {
        const prizesStep: TutorialStep = {
          id: 'pick-prizes',
          title: 'Pick Your Prizes',
          content: '',
          position: 'center',
        };
        baseSteps = [...baseSteps.slice(0, goalStepIdx + 1), prizesStep, ...baseSteps.slice(goalStepIdx + 1)];
      }
    }

    if (type === 'project' && badgeCount >= 3) {
      return baseSteps.map(step =>
        step.id === 'badges'
          ? {
              ...step,
              title: 'Nice Work on Badges!',
              content: 'Good job, you\'ve already added 3 badges to this project! Badges are verified during review to ensure you demonstrated the skills.'
            }
          : step
      );
    }
    return baseSteps;
  }, [type, badgeCount, selectedGoal]);

  const isGoalPickerStep = TUTORIAL_STEPS[currentStep]?.id === 'pick-goal';
  const isPrizePickerStep = TUTORIAL_STEPS[currentStep]?.id === 'pick-prizes';

  useEffect(() => {
    if (forceShow) {
      setIsVisible(true); // eslint-disable-line react-hooks/set-state-in-effect -- sync prop to state
      setCurrentStep(0); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    if (hasFetched.current) return;
    hasFetched.current = true;

    fetch('/api/user/tutorial')
      .then(res => res.json())
      .then((data: TutorialStatus) => {
        const completed = type === 'dashboard' ? data.tutorialDashboard : data.tutorialProject;
        if (!completed) {
          setTimeout(() => setIsVisible(true), 500);
        }
      })
      .catch(() => {
        // If fetch fails, don't show tutorial
      });
  }, [forceShow, type]);

  const updateHighlight = useCallback(() => {
    const step = TUTORIAL_STEPS[currentStep];
    if (step.targetSelector) {
      const element = document.querySelector(step.targetSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        const tooltipHeight = 280;
        const padding = 40;
        const totalNeeded = rect.height + tooltipHeight + padding * 2;

        const elementTop = rect.top + window.scrollY;
        let scrollTarget: number;

        if (step.position === 'top') {
          scrollTarget = elementTop - tooltipHeight - padding * 3;
        } else if (step.position === 'bottom') {
          scrollTarget = elementTop - (window.innerHeight - totalNeeded) / 2 - tooltipHeight - padding;
        } else {
          scrollTarget = elementTop - window.innerHeight / 2 + rect.height / 2;
        }

        window.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });

        setTimeout(() => {
          const newRect = element.getBoundingClientRect();
          setHighlightRect(newRect);
        }, 450);
      } else {
        setHighlightRect(null);
      }
    } else {
      setHighlightRect(null);
    }
  }, [currentStep, TUTORIAL_STEPS]);

  const updateRectOnly = useCallback(() => {
    const step = TUTORIAL_STEPS[currentStep];
    if (step.targetSelector) {
      const element = document.querySelector(step.targetSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        setHighlightRect(rect);
      }
    }
  }, [currentStep, TUTORIAL_STEPS]);

  // Throttled version for scroll/resize events
  const rafIdRef = useRef<number | null>(null);
  const throttledUpdateRect = useCallback(() => {
    if (rafIdRef.current) return;
    rafIdRef.current = requestAnimationFrame(() => {
      updateRectOnly();
      rafIdRef.current = null;
    });
  }, [updateRectOnly]);

  useEffect(() => {
    if (!isVisible) return;

    updateHighlight(); // eslint-disable-line react-hooks/set-state-in-effect -- update highlight position on step change
    window.addEventListener('resize', throttledUpdateRect);
    window.addEventListener('scroll', throttledUpdateRect);

    return () => {
      window.removeEventListener('resize', throttledUpdateRect);
      window.removeEventListener('scroll', throttledUpdateRect);
    };
  }, [isVisible, updateHighlight, throttledUpdateRect]);

  const handleNext = () => {
    if (isGoalPickerStep && selectedGoal) {
      // Save goal preference
      if (selectedGoal === 'prizes') {
        // Don't save yet -- need to pick prizes first, will advance to pick-prizes step
      } else {
        fetch('/api/user/goal-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal: selectedGoal }),
        });
      }
      onGoalChange?.(selectedGoal);
    }
    if (isPrizePickerStep) {
      // Prize picker uses its own confirm flow, not the Next button
      return;
    }
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrizeConfirm = async (prizeIds: string[]) => {
    setSelectedPrizeIds(prizeIds);
    // Save goal + prizes, await so parent refetch gets fresh data
    await fetch('/api/user/goal-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'prizes', goalPrizeIds: prizeIds }),
    });
    onGoalPrizesChange?.(prizeIds);
    // Advance to next step
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrizeBack = () => {
    // Go back to goal picker step
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    fetch('/api/user/tutorial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    setIsVisible(false);
    onComplete?.();
  };

  const step = TUTORIAL_STEPS[currentStep];
  const isCenter = step.position === 'center' || !highlightRect;

  // Estimate tooltip size for position calculations
  const tooltipSizeEstimate = useMemo(() => {
    if (isGoalPickerStep) return { w: Math.min(1160, typeof window !== 'undefined' ? window.innerWidth * 0.95 : 1160), h: 500 };
    if (isPrizePickerStep) return { w: Math.min(780, typeof window !== 'undefined' ? window.innerWidth * 0.95 : 780), h: 500 };
    return { w: Math.min(440, typeof window !== 'undefined' ? window.innerWidth * 0.95 : 440), h: 240 };
  }, [isGoalPickerStep, isPrizePickerStep]);

  const tooltipPosition = useMemo((): CSSProperties => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const tw = tooltipSizeEstimate.w;
    const th = tooltipSizeEstimate.h;

    if (isCenter || !highlightRect) {
      return {
        top: `${Math.max(16, (vh - th) / 2)}px`,
        left: `${Math.max(16, (vw - tw) / 2)}px`,
      };
    }

    const padding = 32;
    const spaceAbove = highlightRect.top;
    const spaceBelow = vh - highlightRect.bottom;
    const extraOffset = (step.id === 'actions' || step.id === 'submit') ? 100 : 0;

    const horizontalCenter = Math.max(
      padding,
      Math.min(
        highlightRect.left + highlightRect.width / 2 - tw / 2,
        vw - tw - padding
      )
    );

    let top: number;
    let left: number;

    if (step.position === 'right') {
      top = highlightRect.top + highlightRect.height / 2 - th / 2;
      left = Math.min(highlightRect.right + padding, vw - tw - padding);
    } else if (step.position === 'left') {
      top = highlightRect.top + highlightRect.height / 2 - th / 2;
      left = Math.max(padding, highlightRect.left - tw - padding);
    } else if (step.position === 'top' && spaceAbove >= th + padding) {
      top = highlightRect.top - th - padding - extraOffset;
      left = horizontalCenter;
    } else if (step.position === 'bottom' && spaceBelow >= th + padding) {
      top = highlightRect.bottom + padding - extraOffset;
      left = horizontalCenter;
    } else if (spaceBelow >= th + padding) {
      top = highlightRect.bottom + padding - extraOffset;
      left = horizontalCenter;
    } else if (spaceAbove >= th + padding) {
      top = highlightRect.top - th - padding - extraOffset;
      left = horizontalCenter;
    } else {
      top = Math.max(16, (vh - th) / 2);
      left = Math.max(16, (vw - tw) / 2);
    }

    return {
      top: `${Math.max(8, top)}px`,
      left: `${Math.max(8, left)}px`,
    };
  }, [isCenter, highlightRect, step.id, step.position, tooltipSizeEstimate]);

  if (!isVisible) return null;

  // Determine next button text
  let nextButtonText = currentStep === TUTORIAL_STEPS.length - 1 ? 'Get Started' : 'Next';
  if (isGoalPickerStep && selectedGoal === 'prizes') {
    nextButtonText = 'Pick Prizes';
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="tutorial-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlightRect && (
              <rect
                x={highlightRect.left - 8}
                y={highlightRect.top - 8}
                width={highlightRect.width + 16}
                height={highlightRect.height + 16}
                rx="4"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Highlight border */}
      {highlightRect && (
        <div
          className="absolute border-2 border-orange-400 pointer-events-none animate-pulse"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <AnimatedResize
        className="absolute bg-cream-100 border-2 border-orange-500 shadow-2xl"
        style={tooltipPosition}
        positionTransition={300}
        duration={200}
      >
        <div className={`p-6 ${
          isGoalPickerStep ? 'w-[min(1160px,95vw)]' : isPrizePickerStep ? 'w-[min(780px,95vw)]' : 'w-[min(440px,95vw)]'
        }`}>
          {/* Progress indicator */}
          <div className="flex gap-1 mb-4">
            {TUTORIAL_STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-1 flex-1 transition-colors ${
                  index <= currentStep ? 'bg-orange-500' : 'bg-cream-400'
                }`}
              />
            ))}
          </div>

          {/* Step counter */}
          <p className="text-cream-500 text-xs uppercase tracking-wider mb-2">
            Step {currentStep + 1} of {TUTORIAL_STEPS.length}
          </p>

          {/* Title */}
          <h3 className="text-brown-800 text-lg font-medium mb-3">
            {step.title}
          </h3>

          {/* Goal picker step */}
          {isGoalPickerStep ? (
            <div>
              <p className="text-brown-800 text-sm leading-relaxed mb-5">
                Through Stasis, you can work toward different goals! Pick which one you want to work toward — you&apos;ll earn bits by building hardware projects. You can change your selection at any time.
              </p>

              <GoalPicker selectedGoal={selectedGoal} onSelect={wrappedSetSelectedGoal} />
            </div>
          ) : isPrizePickerStep ? (
            <PrizeGoalPicker
              initialSelection={selectedPrizeIds}
              onConfirm={handlePrizeConfirm}
              onBack={handlePrizeBack}
            />
          ) : (
            /* Normal step content */
            <p className="text-brown-800 text-sm leading-relaxed mb-6">
              {renderContent(step.content)}
            </p>
          )}

          {/* Navigation - hide for prize picker (it has its own buttons) */}
          {!isPrizePickerStep && (
            <div className={`flex items-center justify-between ${isGoalPickerStep ? 'mt-5' : ''}`}>
              <div className="flex gap-2">
                <button
                  onClick={handleNext}
                  disabled={isGoalPickerStep && !selectedGoal}
                  className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {nextButtonText}
                </button>
                {currentStep > 0 && (
                  <button
                    onClick={handlePrev}
                    className="bg-cream-300 hover:bg-cream-400 text-brown-800 px-4 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                )}
              </div>

              {currentStep < TUTORIAL_STEPS.length - 1 && (
                <button
                  onClick={handleSkip}
                  className="text-cream-500 text-sm hover:text-brown-800 transition-colors cursor-pointer"
                >
                  Skip tutorial
                </button>
              )}
            </div>
          )}
        </div>
      </AnimatedResize>
    </div>
  );
}

export async function resetOnboardingTutorial(type?: TutorialType) {
  const url = type ? `/api/user/tutorial?type=${type}` : '/api/user/tutorial';
  await fetch(url, { method: 'DELETE' });
}
