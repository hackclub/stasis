'use client';

import type { EventPreference } from '@/lib/tiers';

interface Props {
  selectedEvent: EventPreference | null;
  onSelect: (event: EventPreference) => void;
}

export function EventPicker({ selectedEvent, onSelect }: Readonly<Props>) {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Stasis card */}
        <button
          type="button"
          onClick={() => onSelect('stasis')}
          className={`relative text-left border-2 p-5 cursor-pointer flex flex-col justify-start ${
            selectedEvent === 'stasis'
              ? 'border-orange-500 bg-orange-500/5 led-flicker'
              : selectedEvent === null ? 'border-cream-400 hover:border-cream-500' : 'border-cream-400 hover:border-cream-500 opacity-60 hover:opacity-100'
          }`}
        >
          {selectedEvent === 'stasis' && (
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
        <button
          type="button"
          onClick={() => onSelect('opensauce')}
          className={`relative text-left border-2 p-5 cursor-pointer flex flex-col justify-start ${
            selectedEvent === 'opensauce'
              ? 'border-orange-500 bg-orange-500/5 led-flicker'
              : selectedEvent === null ? 'border-cream-400 hover:border-cream-500' : 'border-cream-400 hover:border-cream-500 opacity-60 hover:opacity-100'
          }`}
        >
          {selectedEvent === 'opensauce' && (
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
        Build enough hardware projects and you can qualify for both events!
      </p>
    </div>
  );
}
