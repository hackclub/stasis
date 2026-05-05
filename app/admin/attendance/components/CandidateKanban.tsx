'use client';

import { useMemo, useState } from 'react';
import { Avatar } from './Avatar';
import { FlagPill } from './StatusPill';
import { CandidateRow, KanbanColumn, AttendanceStatus, KANBAN_ORDER, KANBAN_LABEL, kanbanColumnFor, kanbanColumnTone, kanbanColumnAccent, relativeTime, touchHealth } from '../lib/types';

const TOUCH_DOT: Record<ReturnType<typeof touchHealth>, string> = {
  fresh: 'bg-green-500',
  stale: 'bg-yellow-500',
  cold: 'bg-red-500',
  untouched: 'bg-cream-500/40',
};

const DRAG_MIME = 'application/x-attendance-candidate';

// Mapping kanban column → outreachStatus to write on drop. BOOKED_FLIGHT is
// virtual (sourced from the external Attend DB) so it isn't a valid drop target.
const COLUMN_TO_STATUS: Partial<Record<KanbanColumn, AttendanceStatus>> = {
  IDENTIFIED: 'IDENTIFIED',
  CONTACTED: 'CONTACTED',
  SOFT_YES: 'SOFT_YES',
  CONFIRMED_YES: 'CONFIRMED_YES',
  DECLINED: 'DECLINED',
};

export function CandidateKanban({
  rows,
  onOpen,
  onMove,
}: Readonly<{
  rows: CandidateRow[];
  onOpen: (id: string) => void;
  onMove?: (id: string, nextStatus: AttendanceStatus) => void;
}>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<KanbanColumn | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<string, CandidateRow[]>();
    for (const col of KANBAN_ORDER) m.set(col, []);
    for (const r of rows) {
      const col = kanbanColumnFor(r);
      m.get(col)!.push(r);
    }
    return m;
  }, [rows]);

  function handleColumnDragOver(e: React.DragEvent, col: KanbanColumn) {
    if (!draggingId) return;
    const nextStatus = COLUMN_TO_STATUS[col];
    if (!nextStatus) return; // BOOKED_FLIGHT — not droppable
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hoverCol !== col) setHoverCol(col);
  }

  function handleColumnDrop(e: React.DragEvent, col: KanbanColumn) {
    e.preventDefault();
    setHoverCol(null);
    const nextStatus = COLUMN_TO_STATUS[col];
    if (!nextStatus) return;
    const id = e.dataTransfer.getData(DRAG_MIME) || draggingId;
    if (!id) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (row.outreachStatus === nextStatus) return;
    onMove?.(id, nextStatus);
  }

  return (
    <div className="-mx-6 px-6 h-full overflow-x-auto overflow-y-hidden">
      <div className="flex gap-4 min-w-max h-full pb-2">
        {KANBAN_ORDER.map((col) => {
          const items = grouped.get(col) ?? [];
          const tone = kanbanColumnTone(col);
          const accent = kanbanColumnAccent(col);
          const hasItems = items.length > 0;
          const droppable = !!COLUMN_TO_STATUS[col];
          const isHover = hoverCol === col && draggingId !== null;
          const isDragging = draggingId !== null;
          const dimAsInvalid = isDragging && !droppable;
          return (
            <div
              key={col}
              className={`w-[280px] shrink-0 flex flex-col transition-opacity duration-150 ${dimAsInvalid ? 'opacity-50' : ''}`}
              onDragOver={(e) => handleColumnDragOver(e, col)}
              onDragLeave={(e) => {
                // Only clear if leaving the column entirely
                if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
                  if (hoverCol === col) setHoverCol(null);
                }
              }}
              onDrop={(e) => handleColumnDrop(e, col)}
            >
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
              <div
                className={`flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-1 pb-2 transition-[background-color,outline-color] duration-150 outline-2 -outline-offset-2 ${
                  isHover
                    ? 'bg-orange-500/5 outline-dashed outline-orange-500/60'
                    : 'outline-transparent'
                }`}
              >
                {items.map((r, i) => (
                  <KanbanCard
                    key={r.id}
                    row={r}
                    index={i}
                    onOpen={onOpen}
                    isDragging={draggingId === r.id}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData(DRAG_MIME, r.id);
                      // Some browsers require setData on text/plain to start a drag
                      e.dataTransfer.setData('text/plain', r.id);
                      setDraggingId(r.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setHoverCol(null);
                    }}
                  />
                ))}
                {items.length === 0 ? (
                  <div className={`text-xs uppercase tracking-widest py-6 border-2 border-dashed text-center transition-colors duration-150 ${
                    isHover
                      ? 'text-orange-300 border-orange-500/50'
                      : 'text-cream-400 border-cream-200/10'
                  }`}>
                    {isHover ? '· drop here ·' : '· empty ·'}
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

function KanbanCard({
  row,
  index,
  onOpen,
  isDragging,
  onDragStart,
  onDragEnd,
}: Readonly<{
  row: CandidateRow;
  index: number;
  onOpen: (id: string) => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
}>) {
  const lastIso = row.lastComms?.createdAt ?? null;
  const health = touchHealth(lastIso);
  const isSnoozed = !!row.snoozedUntil && new Date(row.snoozedUntil) > new Date();
  const hasFlags = row.attendInvited || row.attendFlightBooked || isSnoozed || !row.userId;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(row.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row.id);
        }
      }}
      style={{ ['--row-i' as keyof React.CSSProperties as string]: Math.min(index, 12) } as React.CSSProperties}
      className={`attendance-card group relative w-full text-left bg-brown-800 border-2 border-cream-200/10 hover:border-orange-500/60 hover:bg-orange-500/10 hover:-translate-y-px transition-[transform,border-color,background-color,color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-0 active:scale-[0.99] cursor-grab active:cursor-grabbing ${isSnoozed ? 'opacity-60' : ''} ${isDragging ? 'opacity-40 border-orange-500/60' : ''}`}
    >
      {/* Identity zone */}
      <div className="flex items-center gap-2.5 min-w-0 px-3 pt-3">
        <Avatar name={row.name} email={row.email} image={row.image} size={26} />
        <div className="flex-1 min-w-0">
          <div className="text-cream-50 text-sm font-medium truncate leading-tight">{row.name ?? row.email ?? '?'}</div>
          {row.owner ? (
            <div className="text-xs text-cream-300 truncate mt-0.5">Owner: {row.owner.name?.split(' ')[0] ?? row.owner.email}</div>
          ) : null}
        </div>
      </div>

      {/* Meta zone — inset darken overlay (tone-agnostic so it picks up hover tint) */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 mt-2.5 bg-black/10 text-xs">
        <div className="flex items-center gap-1.5 text-cream-200 tabular-nums">
          {row.realBits > 0 ? <span title="Real bits earned (project approvals only)" className="text-orange-400 font-medium">{row.realBits}<span className="text-orange-400/60">b</span></span> : <span className="text-cream-400">·</span>}
          {row.projectCount > 0 ? <span title={`${row.projectCount} project${row.projectCount === 1 ? '' : 's'}`} className="text-cream-400">/{row.projectCount}p</span> : null}
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
          {row.attendInvited ? <FlagPill label="A" tone="positive" title="Invited in Attend" /> : null}
          {row.attendFlightBooked ? <FlagPill label="✈" tone="positive" title="Flight booked" /> : null}
          {isSnoozed ? <FlagPill label="zz" tone="snooze" title={`Snoozed until ${new Date(row.snoozedUntil!).toLocaleDateString()}`} /> : null}
          {!row.userId ? <FlagPill label="ext" title="External — no Stasis account" /> : null}
        </div>
      ) : null}
    </div>
  );
}
