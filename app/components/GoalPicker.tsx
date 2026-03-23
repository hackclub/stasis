'use client';

import type { GoalPreference } from '@/lib/tiers';

interface Props {
  selectedGoal: GoalPreference | null;
  onSelect: (goal: GoalPreference) => void;
}

export function GoalPicker({ selectedGoal, onSelect }: Readonly<Props>) {
  const cardClass = (goal: GoalPreference) =>
    `relative text-left border-2 p-5 cursor-pointer flex flex-col justify-start min-w-[280px] flex-1 max-w-[360px] ${
      selectedGoal === goal
        ? 'border-orange-500 bg-orange-500/5 led-flicker'
        : selectedGoal === null ? 'border-cream-400 hover:border-cream-500' : 'border-cream-400 hover:border-cream-500 opacity-60 hover:opacity-100'
    }`;

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-4 mb-4">
        {/* Prizes card */}
        <button type="button" onClick={() => onSelect('prizes')} className={cardClass('prizes')}>
          {selectedGoal === 'prizes' && (
            <span className="absolute top-2 right-2 text-orange-500 text-xs uppercase tracking-wide font-medium">✓ Selected</span>
          )}
          <div className="flex items-center justify-center mb-6 h-24">
            <img
              src="/bambu-orange.png"
              alt="Prizes"
              className="max-h-24 max-w-full object-contain"
              style={{
                transform: 'rotate(-8deg)',
                imageRendering: 'pixelated',
              }}
            />
          </div>
          <p className="text-orange-500 font-medium text-sm mb-2">Set your own goals</p>
          <p className="text-brown-800 text-sm leading-relaxed">
            Skip the events and earn prizes from the shop &mdash; like 3D printers, oscilloscopes, dev boards, and more! Pick the items you want and track your progress towards them.
          </p>
        </button>

        {/* Stasis card */}
        <button type="button" onClick={() => onSelect('stasis')} className={cardClass('stasis')}>
          {selectedGoal === 'stasis' && (
            <span className="absolute top-2 right-2 text-orange-500 text-xs uppercase tracking-wide font-medium">✓ Selected</span>
          )}
          <div className="flex items-center justify-center mb-4 h-24">
            <img src="/stasis-logo.png" alt="Stasis" className="max-h-24 max-w-full object-contain" />
          </div>
          <p className="text-orange-500 font-medium text-sm mb-2">350&nbsp;bits (~45 hrs) to qualify</p>
          <p className="text-brown-800 text-sm leading-relaxed">
            Fly out to Hack Club&apos;s flagship hardware hackathon in Austin, TX. Spend four days building projects with 100+ teenagers from May 15th-18th, 2026.
          </p>
        </button>

        {/* Open Sauce card */}
        <button type="button" onClick={() => onSelect('opensauce')} className={cardClass('opensauce')}>
          {selectedGoal === 'opensauce' && (
            <span className="absolute top-2 right-2 text-orange-500 text-xs uppercase tracking-wide font-medium">✓ Selected</span>
          )}
          <div className="flex items-center justify-center mb-4 h-24">
            <img src="/open-sauce-stasis.png" alt="Open Sauce" className="max-h-24 max-w-full object-contain" />
          </div>
          <p className="text-orange-500 font-medium text-sm mb-2">250&nbsp;bits (~35 hrs) to qualify</p>
          <p className="text-brown-800 text-sm leading-relaxed mb-3">
            Come to the biggest maker festival in the world with a group of teenagers from Hack Club. See 500+ projects, meet famous creators, and explore hands-on demos in San Francisco, July 17-19, 2026.
          </p>
          <a
            href="https://opensauce.com"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-orange-500 hover:text-orange-400 text-xs uppercase tracking-wide underline"
          >
            Learn more about Open Sauce
          </a>
        </button>
      </div>

      <p className="text-cream-500 text-xs text-center leading-relaxed">
        Build hardware projects and earn bits toward your goal!
      </p>
    </div>
  );
}
