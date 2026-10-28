'use client';

import { useEffect, useRef, useState } from 'react';
import type { BadgeType } from '@/app/generated/prisma/enums';
import { AVAILABLE_BADGES, getBadgeImage } from '@/lib/badges';

/** Badge filter for the gallery: a popover grid of badge art instead of a native select. */
export function BadgePicker({ value, onChange }: Readonly<{
  value: BadgeType | '';
  onChange: (v: BadgeType | '') => void;
}>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = AVAILABLE_BADGES.find((b) => b.value === value);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (v: BadgeType | '') => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-cream-600 text-xs uppercase tracking-wider">Badges</span>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`flex items-center gap-2 pl-1.5 pr-2 py-0.5 border-2 text-xs uppercase tracking-wider text-brown-800 transition-colors cursor-pointer ${
            selected || open
              ? 'bg-cream-200 border-brown-800'
              : 'bg-cream-100 border-cream-400 hover:border-brown-800'
          }`}
        >
          {selected ? (
            <img src={getBadgeImage(selected.value)} alt="" className="w-5 h-5 object-contain" />
          ) : (
            <span className="w-5 h-5 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            </span>
          )}
          <span>{selected?.label ?? 'Any'}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {open && (
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Filter by badge"
            className="absolute left-0 top-full mt-1 z-30 w-[min(30rem,calc(100vw-2rem))] bg-cream-100 border-2 border-cream-400 p-2 shadow-[0_8px_24px_rgba(59,48,38,0.18)]"
          >
            <button
              type="button"
              role="option"
              aria-selected={!selected}
              onClick={() => pick('')}
              className={`w-full mb-2 px-2 py-1.5 text-left text-xs uppercase tracking-wider text-brown-800 border transition-colors cursor-pointer outline-none focus-visible:border-brown-800 ${
                !selected
                  ? 'border-brown-800 bg-cream-200'
                  : 'border-cream-400 hover:border-brown-800'
              }`}
            >
              Any badge
            </button>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {AVAILABLE_BADGES.map((b) => {
                const isSelected = b.value === value;
                return (
                  <button
                    key={b.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => pick(b.value)}
                    className={`flex items-center gap-2 p-1.5 text-left text-brown-800 border transition-colors cursor-pointer outline-none focus-visible:border-brown-800 ${
                      isSelected
                        ? 'border-brown-800 bg-cream-200'
                        : 'border-transparent hover:border-cream-400 hover:bg-cream-200'
                    }`}
                  >
                    <img src={getBadgeImage(b.value)} alt="" className="w-9 h-9 object-contain flex-shrink-0" />
                    <span className="text-xs leading-tight">{b.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
