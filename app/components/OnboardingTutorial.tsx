'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface TutorialStep {
  id: string;
  title: string;
  content: string;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: 'click' | 'wait';
}

export type TutorialType = 'dashboard' | 'project';

interface TutorialStatus {
  tutorialDashboard: boolean;
  tutorialProject: boolean;
}

const DASHBOARD_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Stasis!',
    content: 'Stasis is where you design and build hardware projects, earn skill badges, and get funding for parts. Let\'s get you started!',
    position: 'center',
  },
  {
    id: 'badge-progress',
    title: 'Your Goal: Earn Badges',
    content: 'To attend the event, you need to earn 5 approved skill badges. Each badge represents a skill you\'ve demonstrated in your projects.',
    targetSelector: '[data-tutorial="badge-progress"]',
    position: 'bottom',
  },
  {
    id: 'stats',
    title: 'Track Your Hours',
    content: 'You earn $5/hour for approved work. Log your hours as you work, and they\'ll be reviewed and approved by the team.',
    targetSelector: '[data-tutorial="stats"]',
    position: 'bottom',
  },
  {
    id: 'starter-projects',
    title: 'Need Ideas?',
    content: 'Browse starter projects for inspiration. These are pre-designed projects you can build, or use them as a starting point for your own ideas.',
    targetSelector: '[data-tutorial="starter-projects"]',
    position: 'bottom',
  },
  {
    id: 'new-project',
    title: 'Create Your First Project',
    content: 'Click here to start a new project. Give it a name, add a description, and select the technologies you\'ll use.',
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
    content: 'List every part you need with costs and links. Once approved, you\'ll get a grant card to purchase these materials.',
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
    content: 'Planning a 7+ hour session? Start a timelapse recording before you begin. This is required for longer work sessions.',
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
    content: 'Everything you do is tracked here—sessions, reviews, status changes. It\'s your project\'s complete history.',
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
}

export function OnboardingTutorial({ type, forceShow = false, onComplete }: Readonly<Props>) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const hasFetched = useRef(false);

  const TUTORIAL_STEPS = type === 'dashboard' ? DASHBOARD_STEPS : PROJECT_STEPS;

  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
      setCurrentStep(0);
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

  useEffect(() => {
    if (!isVisible) return;
    
    updateHighlight();
    window.addEventListener('resize', updateRectOnly);
    window.addEventListener('scroll', updateRectOnly);
    
    return () => {
      window.removeEventListener('resize', updateRectOnly);
      window.removeEventListener('scroll', updateRectOnly);
    };
  }, [isVisible, updateHighlight, updateRectOnly]);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
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

  if (!isVisible) return null;

  const step = TUTORIAL_STEPS[currentStep];
  const isCenter = step.position === 'center' || !highlightRect;

  const getTooltipPosition = () => {
    if (isCenter || !highlightRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const padding = 32;
    const tooltipWidth = 360;
    const tooltipHeight = 240;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceAbove = highlightRect.top;
    const spaceBelow = viewportHeight - highlightRect.bottom;
    
    const extraOffset = (step.id === 'actions' || step.id === 'submit') ? 100 : 0;

    const horizontalCenter = Math.max(
      padding,
      Math.min(
        highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2,
        viewportWidth - tooltipWidth - padding
      )
    );

    if (step.position === 'top' && spaceAbove >= tooltipHeight + padding) {
      return {
        top: `${highlightRect.top - tooltipHeight - padding - extraOffset}px`,
        left: `${horizontalCenter}px`,
      };
    }
    
    if (step.position === 'bottom' && spaceBelow >= tooltipHeight + padding) {
      return {
        top: `${highlightRect.bottom + padding - extraOffset}px`,
        left: `${horizontalCenter}px`,
      };
    }

    if (spaceBelow >= tooltipHeight + padding) {
      return {
        top: `${highlightRect.bottom + padding - extraOffset}px`,
        left: `${horizontalCenter}px`,
      };
    }

    if (spaceAbove >= tooltipHeight + padding) {
      return {
        top: `${highlightRect.top - tooltipHeight - padding - extraOffset}px`,
        left: `${horizontalCenter}px`,
      };
    }

    switch (step.position) {
      case 'left':
        return {
          top: `${Math.max(padding, Math.min(highlightRect.top + highlightRect.height / 2 - tooltipHeight / 2, viewportHeight - tooltipHeight - padding))}px`,
          left: `${Math.max(padding, highlightRect.left - tooltipWidth - padding)}px`,
        };
      case 'right':
        return {
          top: `${Math.max(padding, Math.min(highlightRect.top + highlightRect.height / 2 - tooltipHeight / 2, viewportHeight - tooltipHeight - padding))}px`,
          left: `${Math.min(highlightRect.right + padding, viewportWidth - tooltipWidth - padding)}px`,
        };
      default:
        return {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };
    }
  };

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
          className="absolute border-2 border-brand-400 rounded pointer-events-none animate-pulse"
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute bg-cream-900 border-2 border-brand-500 p-6 max-w-[360px] w-full shadow-2xl"
        style={getTooltipPosition()}
      >
        {/* Progress indicator */}
        <div className="flex gap-1 mb-4">
          {TUTORIAL_STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index <= currentStep ? 'bg-brand-500' : 'bg-cream-700'
              }`}
            />
          ))}
        </div>

        {/* Step counter */}
        <p className="text-cream-400 text-xs uppercase tracking-wider mb-2">
          Step {currentStep + 1} of {TUTORIAL_STEPS.length}
        </p>

        {/* Title */}
        <h3 className="text-cream-50 text-lg font-medium mb-3">
          {step.title}
        </h3>

        {/* Content */}
        <p className="text-cream-300 text-sm leading-relaxed mb-6">
          {step.content}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-cream-400 text-sm hover:text-cream-200 transition-colors cursor-pointer"
          >
            Skip tutorial
          </button>
          
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="bg-cream-800 hover:bg-cream-700 text-cream-100 px-4 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="bg-brand-500 hover:bg-brand-400 text-white px-4 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
            >
              {currentStep === TUTORIAL_STEPS.length - 1 ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export async function resetOnboardingTutorial(type?: TutorialType) {
  const url = type ? `/api/user/tutorial?type=${type}` : '/api/user/tutorial';
  await fetch(url, { method: 'DELETE' });
}

export function TutorialHelpButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 bg-brand-500 hover:bg-brand-400 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 cursor-pointer"
      title="Show tutorial"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <circle cx="12" cy="17" r="1" fill="currentColor"/>
      </svg>
    </button>
  );
}
