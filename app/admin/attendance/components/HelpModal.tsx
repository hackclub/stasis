'use client';

import { useEffect } from 'react';
import { Avatar } from './Avatar';

interface Shortcut {
  keys: React.ReactNode;
  desc: string;
}

const SHORTCUTS: Array<{ heading: string; items: Shortcut[] }> = [
  {
    heading: 'Global',
    items: [
      { keys: <Key>?</Key>, desc: 'Open this help' },
      { keys: <Key>/</Key>, desc: 'Focus search' },
      { keys: <Key>n</Key>, desc: 'Add candidate' },
      { keys: <Key>v</Key>, desc: 'Cycle view (kanban → table → sourcing)' },
      { keys: <Key>Esc</Key>, desc: 'Close dialog · clear search · drop highlight' },
    ],
  },
  {
    heading: 'Table view',
    items: [
      { keys: <><Key>j</Key>/<Key>↓</Key></>, desc: 'Highlight next row' },
      { keys: <><Key>k</Key>/<Key>↑</Key></>, desc: 'Highlight previous row' },
      { keys: <Key>Enter</Key>, desc: 'Open highlighted candidate' },
    ],
  },
];

const TIPS: Array<{ title: string; body: string }> = [
  {
    title: 'Drag to advance',
    body: 'Drag a card between Reached out → Soft yes → Confirmed yes to update status. Travel confirmed is automatic — set the flight as booked on the candidate, and the card slides over.',
  },
  {
    title: 'Right-click for everything',
    body: 'Right-click any card for the full action menu: change status, assign owner, send Attend invite, jump to user record.',
  },
  {
    title: 'Status note is inline',
    body: "Click the status text on a card to edit it in place. Enter to save, Esc to cancel. Use it for the one thing you'd want to know in 2 weeks.",
  },
  {
    title: 'Inactive lane is for dead ends',
    body: 'Declined and shelved candidates collapse into the rightmost lane so the funnel stays focused on people you can still move.',
  },
];

const TOUCH_LEGEND: Array<{ dot: string; label: string; range: string }> = [
  { dot: 'bg-green-500', label: 'Fresh', range: '≤ 3 days since last contact' },
  { dot: 'bg-yellow-500', label: 'Stale', range: '4 – 7 days' },
  { dot: 'bg-red-500', label: 'Cold', range: '> 7 days' },
  { dot: 'bg-cream-500/40', label: 'Untouched', range: 'no comms logged' },
];

const COLUMN_LEGEND: Array<{ accent: string; tone: string; label: string; meaning: string }> = [
  { accent: 'bg-orange-500/60', tone: 'text-orange-400', label: 'Reached out', meaning: 'CONTACTED — first message sent, awaiting reply' },
  { accent: 'bg-yellow-500/60', tone: 'text-yellow-500', label: 'Soft yes', meaning: 'SOFT_YES — verbal interest, not yet committed' },
  { accent: 'bg-green-500/60', tone: 'text-green-500', label: 'Confirmed yes', meaning: 'CONFIRMED_YES — locked in, flight not booked' },
  { accent: 'bg-emerald-400/70', tone: 'text-emerald-300', label: 'Travel confirmed', meaning: 'CONFIRMED_YES + flight on file in Attend' },
];

export function HelpModal({ onClose }: Readonly<{ onClose: () => void }>) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-5xl max-h-full bg-brown-900 outline outline-1 -outline-offset-1 outline-cream-200/10 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Attendance help"
      >
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-cream-200/10 sticky top-0 bg-brown-900 z-10">
          <div>
            <h2 className="text-cream-50 text-lg font-medium">Help & shortcuts</h2>
            <p className="text-xs text-cream-400 mt-0.5">Press <Key>?</Key> any time to bring this back.</p>
          </div>
          <button
            onClick={onClose}
            className="text-xs uppercase tracking-widest font-medium px-3 py-2 bg-brown-800 hover:bg-brown-700 text-cream-200 cursor-pointer transition-[background-color] duration-150 active:scale-[0.97]"
          >Close · Esc</button>
        </header>

        <div className="px-6 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
          <Section title="Anatomy of a card">
            <AnnotatedCard />
            <ol className="mt-4 space-y-2.5 text-sm">
              {ANNOTATIONS.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <NumberBadge n={i + 1} />
                  <div className="min-w-0">
                    <div className="text-cream-100 font-medium">{a.title}</div>
                    <div className="text-cream-300 text-xs mt-0.5">{a.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <div className="flex flex-col gap-6">
            <Section title="Keyboard shortcuts">
              <div className="space-y-5">
                {SHORTCUTS.map((group) => (
                  <div key={group.heading}>
                    <div className="text-xs uppercase tracking-widest text-cream-400 font-medium mb-2">{group.heading}</div>
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
                      {group.items.map((s, i) => (
                        <div key={i} className="contents">
                          <div className="flex items-center gap-1 justify-end whitespace-nowrap">{s.keys}</div>
                          <div className="text-cream-200 text-sm self-center">{s.desc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Tips">
              <ul className="space-y-3">
                {TIPS.map((t, i) => (
                  <li key={i} className="bg-brown-800 px-3 py-2.5">
                    <div className="text-cream-100 text-sm font-medium">{t.title}</div>
                    <div className="text-cream-300 text-xs mt-1 leading-relaxed">{t.body}</div>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>

        <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Touch health">
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-3 gap-y-2 items-center">
              {TOUCH_LEGEND.map((t) => (
                <div key={t.label} className="contents">
                  <span className={`inline-block w-2 h-2 rounded-full ${t.dot}`} aria-hidden />
                  <div className="text-cream-100 text-sm font-medium">{t.label}</div>
                  <div className="text-cream-300 text-xs">{t.range}</div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Funnel columns">
            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-3 gap-y-2 items-center">
              {COLUMN_LEGEND.map((c) => (
                <div key={c.label} className="contents">
                  <span className={`inline-block w-1.5 h-4 ${c.accent}`} aria-hidden />
                  <div className={`text-sm font-medium ${c.tone}`}>{c.label}</div>
                  <div className="text-cream-300 text-xs">{c.meaning}</div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-widest text-cream-300 font-medium mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Key({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-px bg-brown-800 text-cream-100 text-xs font-medium tabular-nums border border-cream-200/10">
      {children}
    </kbd>
  );
}

function NumberBadge({ n }: Readonly<{ n: number }>) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 bg-orange-500/20 text-orange-300 text-xs font-semibold tabular-nums shrink-0 mt-0.5">
      {n}
    </span>
  );
}

const ANNOTATIONS: Array<{ title: string; body: string }> = [
  { title: 'Avatar + name', body: 'Profile photo (Slack / GitHub / fallback initial). Click anywhere outside the inline status to open the full profile.' },
  { title: 'Girl marker', body: '♀ shows when isGirl=true on the candidate. Counts toward the 40-girl event target shown in the funnel strip.' },
  { title: 'Source · Owner', body: 'How they got here (Stasis user, Reviewer incentive, HC Builder, Other) and which admin owns the relationship. Reviewer incentive shows the n/30 review count instead.' },
  { title: 'Location', body: 'Best-known location: manual home city → Attend cached city → home airport (IATA). Empty when nothing is on file.' },
  { title: 'Status note', body: 'Free-form, click to edit inline. Use it for the one-line "what\'s happening right now" — saved on Enter or blur.' },
  { title: 'Attend status pill', body: '"In Attend" once they\'ve been invited via the right-click menu. "(external)" tag when there\'s no Stasis user record linked.' },
  { title: 'Touch indicator', body: 'Dot color = freshness of last comms log entry. Time = relative timestamp of the most recent message in either direction.' },
];

function AnnotatedCard() {
  return (
    <div className="bg-brown-950/40 px-4 py-5 outline outline-1 -outline-offset-1 outline-cream-200/5">
      <div className="relative w-full max-w-[280px] mx-auto">
        <div className="attendance-card relative w-full text-left bg-brown-800 border-2 border-cream-200/10">
          {/* Identity zone */}
          <div className="flex items-start gap-2.5 min-w-0 px-3 pt-3">
            <div className="relative shrink-0">
              <Avatar name="Maya Chen" email="maya@example.com" image={null} size={32} />
              <Marker n={1} className="-top-1.5 -left-1.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-cream-50 text-sm font-medium truncate leading-tight">Maya Chen</div>
                <span className="relative text-pink-300 text-sm leading-none shrink-0">
                  ♀
                  <Marker n={2} className="-top-2 -right-2" />
                </span>
              </div>
              <div className="relative text-xs text-cream-300 truncate mt-0.5">
                Stasis<span className="text-cream-400"> · Owner: <span className="text-cream-200">Augie</span></span>
                <Marker n={3} className="-top-2 right-0" />
              </div>
              <div className="relative text-xs text-cream-400 truncate mt-0.5">
                Brooklyn, NY
                <Marker n={4} className="-top-1.5 -right-1.5" />
              </div>
            </div>
          </div>

          {/* Status note */}
          <div className="relative px-3 pt-3 pb-2.5">
            <div className="text-cream-100 text-sm leading-snug">
              Mom’s onboard, finishing CAD this week
            </div>
            <Marker n={5} className="-top-1 -right-1" />
          </div>

          {/* Bottom row */}
          <div className="relative flex items-center justify-between gap-2 px-3 py-2 bg-black/15 text-xs">
            <span className="relative inline-flex items-center gap-1 text-green-400 font-medium">
              <span aria-hidden className="text-green-400">✓</span> In Attend
              <Marker n={6} className="-top-2 -left-2" />
            </span>
            <div className="relative flex items-center gap-1.5 text-cream-300 tabular-nums shrink-0">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden />
              <span>2d ago</span>
              <Marker n={7} className="-top-2 -right-2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Marker({ n, className }: Readonly<{ n: number; className?: string }>) {
  return (
    <span
      className={`absolute inline-flex items-center justify-center w-5 h-5 bg-orange-500 text-brown-950 text-[10px] font-bold tabular-nums shadow-[0_0_0_2px_rgba(0,0,0,0.5)] pointer-events-none ${className ?? ''}`}
      aria-hidden
    >
      {n}
    </span>
  );
}
