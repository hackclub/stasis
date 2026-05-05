'use client';

import { useMemo } from 'react';
import { Avatar } from './Avatar';
import { FlagPill } from './StatusPill';
import { CandidateRow, KANBAN_ORDER, KANBAN_LABEL, kanbanColumnFor, relativeTime, touchHealth } from '../lib/types';

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
    <div className="-mx-6 px-6 overflow-x-auto">
      <div className="flex gap-4 min-w-max pb-2">
        {KANBAN_ORDER.map((col, i) => {
          const items = grouped.get(col) ?? [];
          const rank = String(i + 1).padStart(2, '0');
          return (
            <div key={col} className="w-[280px] shrink-0 flex flex-col">
              {/* Column header — instrumented bracket, no nested card */}
              <div className="flex items-baseline justify-between gap-2 pb-2 mb-3 border-b border-dashed border-brown-700">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-[10px] text-cream-500 tabular-nums">{rank}</span>
                  <span className="text-[10px] uppercase tracking-widest text-cream-100 truncate">
                    {KANBAN_LABEL[col]}
                  </span>
                </div>
                <span className="text-[11px] text-cream-200 tabular-nums">{items.length}</span>
              </div>
              <div className="flex-1 space-y-3 min-h-[120px] max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
                {items.map((r) => (
                  <KanbanCard key={r.id} row={r} onOpen={onOpen} />
                ))}
                {items.length === 0 ? (
                  <div className="text-[10px] text-cream-500 uppercase tracking-wider px-0.5 py-3 border border-dashed border-brown-800">
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

function KanbanCard({ row, onOpen }: Readonly<{ row: CandidateRow; onOpen: (id: string) => void }>) {
  const lastIso = row.lastComms?.createdAt ?? null;
  const health = touchHealth(lastIso);
  const isSnoozed = !!row.snoozedUntil && new Date(row.snoozedUntil) > new Date();
  const hasFlags = row.attendInvited || row.attendFlightBooked || isSnoozed || !row.userId;
  return (
    <button
      onClick={() => onOpen(row.id)}
      className={`group relative w-full text-left bg-brown-800/40 border border-brown-700/70 hover:border-orange-500/50 hover:bg-brown-800/70 transition-colors cursor-pointer ${isSnoozed ? 'opacity-60' : ''}`}
    >
      {/* Identity zone */}
      <div className="flex items-center gap-2.5 min-w-0 px-3 pt-3">
        <Avatar name={row.name} email={row.email} image={row.image} size={26} />
        <div className="flex-1 min-w-0">
          <div className="text-cream-50 text-xs truncate leading-tight">{row.name ?? row.email ?? '?'}</div>
          {row.owner ? (
            <div className="text-[10px] text-cream-400 truncate mt-0.5">→ {row.owner.name?.split(' ')[0] ?? row.owner.email}</div>
          ) : null}
        </div>
      </div>

      {/* Meta zone — separated by hairline rule for rhythm */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 mt-2.5 border-t border-brown-700/50 text-[10px]">
        <div className="flex items-center gap-1.5 text-cream-300 tabular-nums">
          {row.realBits > 0 ? <span className="text-cream-100">{row.realBits}b</span> : <span className="text-cream-500">·</span>}
          {row.projectCount > 0 ? <span className="text-cream-500">/{row.projectCount}p</span> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${TOUCH_DOT[health]}`} aria-hidden />
          <span className="text-cream-400 tabular-nums">{lastIso ? relativeTime(lastIso) : '—'}</span>
        </div>
      </div>

      {/* Snippet zone */}
      {row.lastComms?.text ? (
        <div className="px-3 pb-2.5 text-[11px] text-cream-300 line-clamp-2 leading-snug">
          {row.lastComms.text}
        </div>
      ) : null}

      {/* Flag rail — pinned to bottom edge so cards align */}
      {hasFlags ? (
        <div className="flex items-center gap-1 flex-wrap px-3 pb-2.5 pt-0">
          {row.attendInvited ? <FlagPill label="A" tone="positive" /> : null}
          {row.attendFlightBooked ? <FlagPill label="✈" tone="positive" /> : null}
          {isSnoozed ? <FlagPill label="zz" tone="snooze" /> : null}
          {!row.userId ? <FlagPill label="ext" /> : null}
        </div>
      ) : null}
    </button>
  );
}
