'use client';

import { useMemo } from 'react';
import { Avatar } from './Avatar';
import { FlagPill } from './StatusPill';
import { CandidateRow, KANBAN_ORDER, KANBAN_LABEL, kanbanColumnFor, kanbanColumnTone, kanbanColumnAccent, relativeTime, touchHealth } from '../lib/types';

const TOUCH_DOT: Record<ReturnType<typeof touchHealth>, string> = {
  fresh: 'bg-green-500',
  stale: 'bg-yellow-500',
  cold: 'bg-red-500',
  untouched: 'bg-cream-500/40',
};

export function CandidateKanban({
  rows,
  onOpen,
}: Readonly<{ rows: CandidateRow[]; onOpen: (id: string) => void }>) {
  const grouped = useMemo(() => {
    const m = new Map<string, CandidateRow[]>();
    for (const col of KANBAN_ORDER) m.set(col, []);
    for (const r of rows) {
      const col = kanbanColumnFor(r);
      m.get(col)!.push(r);
    }
    return m;
  }, [rows]);

  return (
    <div className="-mx-6 px-6 h-full overflow-x-auto overflow-y-hidden">
      <div className="flex gap-4 min-w-max h-full pb-2">
        {KANBAN_ORDER.map((col) => {
          const items = grouped.get(col) ?? [];
          const tone = kanbanColumnTone(col);
          const accent = kanbanColumnAccent(col);
          const hasItems = items.length > 0;
          return (
            <div key={col} className="w-[280px] shrink-0 flex flex-col">
              {/* Column header — solid block with leading accent chip */}
              <div className={`flex items-center justify-between gap-2 mb-3 ${hasItems ? 'bg-brown-800' : 'bg-brown-800/40'}`}>
                <div className="flex items-stretch gap-2.5 min-w-0">
                  <span className={`block w-1.5 ${hasItems ? accent : 'bg-brown-900'}`} aria-hidden />
                  <span className="text-xs uppercase tracking-widest text-cream-100 font-medium truncate self-center py-2">
                    {KANBAN_LABEL[col]}
                  </span>
                </div>
                <span className={`text-xs font-medium tabular-nums px-3 py-2 ${hasItems ? tone : 'text-cream-400'}`}>{items.length}</span>
              </div>
              <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-1 pb-2">
                {items.map((r, i) => (
                  <KanbanCard key={r.id} row={r} index={i} onOpen={onOpen} />
                ))}
                {items.length === 0 ? (
                  <div className="text-xs text-cream-400 uppercase tracking-widest py-6 border-2 border-dashed border-cream-200/10 text-center">
                    · empty ·
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({ row, index, onOpen }: Readonly<{ row: CandidateRow; index: number; onOpen: (id: string) => void }>) {
  const lastIso = row.lastComms?.createdAt ?? null;
  const health = touchHealth(lastIso);
  const isSnoozed = !!row.snoozedUntil && new Date(row.snoozedUntil) > new Date();
  const hasFlags = row.attendInvited || row.attendFlightBooked || isSnoozed || !row.userId;
  return (
    <button
      onClick={() => onOpen(row.id)}
      style={{ ['--row-i' as keyof React.CSSProperties as string]: Math.min(index, 12) } as React.CSSProperties}
      className={`attendance-card group relative w-full text-left bg-brown-800 border-2 border-cream-200/10 hover:border-orange-500/60 hover:bg-orange-500/10 hover:-translate-y-px transition-[transform,border-color,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-0 active:scale-[0.99] cursor-pointer ${isSnoozed ? 'opacity-60' : ''}`}
    >
      {/* Identity zone */}
      <div className="flex items-center gap-2.5 min-w-0 px-3 pt-3">
        <Avatar name={row.name} email={row.email} image={row.image} size={26} />
        <div className="flex-1 min-w-0">
          <div className="text-cream-50 text-sm font-medium truncate leading-tight">{row.name ?? row.email ?? '?'}</div>
          {row.owner ? (
            <div className="text-xs text-cream-300 truncate mt-0.5">→ {row.owner.name?.split(' ')[0] ?? row.owner.email}</div>
          ) : null}
        </div>
      </div>

      {/* Meta zone — inset darken overlay (tone-agnostic so it picks up hover tint) */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 mt-2.5 bg-black/10 text-xs">
        <div className="flex items-center gap-1.5 text-cream-200 tabular-nums">
          {row.realBits > 0 ? <span className="text-orange-400 font-medium">{row.realBits}<span className="text-orange-400/60">b</span></span> : <span className="text-cream-400">·</span>}
          {row.projectCount > 0 ? <span className="text-cream-400">/{row.projectCount}p</span> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${TOUCH_DOT[health]} ${health === 'fresh' ? 'attendance-dot-fresh' : ''}`} aria-hidden />
          <span className="text-cream-300 tabular-nums">{lastIso ? relativeTime(lastIso) : '—'}</span>
        </div>
      </div>

      {/* Snippet zone */}
      {row.lastComms?.text ? (
        <div className="px-3 pt-2.5 pb-2.5 text-xs text-cream-200 line-clamp-2 leading-snug">
          {row.lastComms.text}
        </div>
      ) : null}

      {/* Flag rail — pinned to bottom edge so cards align */}
      {hasFlags ? (
        <div className={`flex items-center gap-1 flex-wrap px-3 pb-2.5 ${row.lastComms?.text ? 'pt-0' : 'pt-2.5'}`}>
          {row.attendInvited ? <FlagPill label="A" tone="positive" /> : null}
          {row.attendFlightBooked ? <FlagPill label="✈" tone="positive" /> : null}
          {isSnoozed ? <FlagPill label="zz" tone="snooze" /> : null}
          {!row.userId ? <FlagPill label="ext" /> : null}
        </div>
      ) : null}
    </button>
  );
}
