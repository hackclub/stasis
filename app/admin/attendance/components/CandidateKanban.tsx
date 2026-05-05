'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar';
import { SOURCE_LABEL, CandidateRow, KanbanColumn, AttendanceStatus, AdminUser, KANBAN_ORDER, KANBAN_LABEL, kanbanColumnFor, kanbanColumnTone, kanbanColumnAccent, relativeTime, touchHealth, locationLabel } from '../lib/types';
import { ContextMenu, MenuItem } from './ContextMenu';
import { InviteAttendDialog } from './InviteAttendDialog';

const TOUCH_DOT: Record<ReturnType<typeof touchHealth>, string> = {
  fresh: 'bg-green-500',
  stale: 'bg-yellow-500',
  cold: 'bg-red-500',
  untouched: 'bg-cream-500/40',
};

const DRAG_MIME = 'application/x-attendance-candidate';

const COLUMN_TO_STATUS: Partial<Record<KanbanColumn, AttendanceStatus>> = {
  CONTACTED: 'CONTACTED',
  SOFT_YES: 'SOFT_YES',
  CONFIRMED_YES: 'CONFIRMED_YES',
};

interface InviteTarget {
  candidateId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  alreadyInvited: boolean;
}

export function CandidateKanban({
  rows,
  onOpen,
  onMove,
  admins,
  onReload,
}: Readonly<{
  rows: CandidateRow[];
  onOpen: (id: string) => void;
  onMove?: (id: string, nextStatus: AttendanceStatus) => void;
  admins: AdminUser[];
  onReload: () => void;
}>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<InviteTarget | null>(null);

  const grouped = useMemo(() => {
    const m = new Map<string, CandidateRow[]>();
    for (const col of KANBAN_ORDER) m.set(col, []);
    m.set('INACTIVE', []);
    for (const r of rows) {
      if (r.outreachStatus === 'DECLINED' || r.outreachStatus === 'SHELVED') {
        m.get('INACTIVE')!.push(r);
        continue;
      }
      const col = kanbanColumnFor(r);
      if (col) m.get(col)!.push(r);
    }
    return m;
  }, [rows]);

  function handleColumnDragOver(e: React.DragEvent, col: KanbanColumn) {
    if (!draggingId) return;
    if (!COLUMN_TO_STATUS[col]) return;
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

  async function setOwner(id: string, ownerId: string | null) {
    await fetch(`/api/admin/attendance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerId }),
    });
    onReload();
  }

  function buildMenuItems(row: CandidateRow): MenuItem[] {
    const moves: MenuItem[] = (
      [
        ['IDENTIFIED', 'Pool'],
        ['CONTACTED', 'Reached out'],
        ['SOFT_YES', 'Soft yes'],
        ['CONFIRMED_YES', 'Confirmed yes'],
        ['SHELVED', 'Shelved'],
        ['DECLINED', 'Declined'],
      ] as const
    ).map(([status, label]) => ({
      label,
      disabled: row.outreachStatus === status,
      onSelect: () => onMove?.(row.id, status as AttendanceStatus),
    }));

    const ownerOptions: MenuItem[] = [
      { label: '— Unassigned —', disabled: row.ownerId === null, onSelect: () => setOwner(row.id, null) },
      ...admins.map((a) => ({
        label: a.name ?? a.email,
        disabled: a.id === row.ownerId,
        onSelect: () => setOwner(row.id, a.id),
      })),
    ];

    const items: MenuItem[] = [
      { type: 'submenu', label: 'Move to', children: moves },
      { type: 'submenu', label: 'Assign owner', children: ownerOptions },
      { type: 'separator' },
      {
        label: row.attendInvited ? 'Send Attend invite (already invited)' : 'Send Attend invite…',
        hint: '↗',
        disabled: !(row.email),
        onSelect: () => setInviteTarget({
          candidateId: row.id,
          name: row.name,
          email: row.email,
          image: row.image,
          alreadyInvited: row.attendInvited,
        }),
      },
      ...(row.userId ? [{
        label: 'Open user record',
        hint: '↗',
        onSelect: () => window.open(`/admin/users?search=${encodeURIComponent(row.email ?? '')}`, '_blank'),
      } as MenuItem] : []),
      { type: 'separator' },
      { label: 'Open profile', onSelect: () => onOpen(row.id) },
    ];
    return items;
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
                if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
                  if (hoverCol === col) setHoverCol(null);
                }
              }}
              onDrop={(e) => handleColumnDrop(e, col)}
            >
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
                  isHover ? 'bg-orange-500/5 outline-dashed outline-orange-500/60' : 'outline-transparent'
                }`}
              >
                {items.map((r, i) => (
                  <KanbanCard
                    key={r.id}
                    row={r}
                    index={i}
                    onOpen={onOpen}
                    onReload={onReload}
                    isDragging={draggingId === r.id}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData(DRAG_MIME, r.id);
                      e.dataTransfer.setData('text/plain', r.id);
                      setDraggingId(r.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setHoverCol(null);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, items: buildMenuItems(r) });
                    }}
                  />
                ))}
                {items.length === 0 ? (
                  <div className={`text-xs uppercase tracking-widest py-6 border-2 border-dashed text-center transition-colors duration-150 ${
                    isHover ? 'text-orange-300 border-orange-500/50' : 'text-cream-400 border-cream-200/10'
                  }`}>
                    {isHover ? '· drop here ·' : '· empty ·'}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        <div className="shrink-0 self-stretch flex items-stretch px-3" aria-hidden>
          <span className="block w-px self-stretch bg-cream-200/10" />
        </div>

        <div className="w-[240px] shrink-0 flex flex-col">
          <div className={`flex items-center justify-between gap-2 mb-3 ${grouped.get('INACTIVE')!.length > 0 ? 'bg-brown-800' : 'bg-brown-800/40'}`}>
            <div className="flex items-stretch gap-2.5 min-w-0">
              <span className="block w-1.5 bg-cream-300/30" aria-hidden />
              <span className="text-xs uppercase tracking-widest text-cream-300 font-medium truncate self-center py-2">Inactive</span>
            </div>
            <span className="text-xs font-medium tabular-nums px-3 py-2 text-cream-400">{grouped.get('INACTIVE')!.length}</span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-1 pb-2">
            {grouped.get('INACTIVE')!.length === 0 ? (
              <div className="text-xs uppercase tracking-widest py-6 border-2 border-dashed border-cream-200/10 text-center text-cream-400">· empty ·</div>
            ) : grouped.get('INACTIVE')!.map((r) => (
              <InactiveCard
                key={r.id}
                row={r}
                onOpen={onOpen}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, items: buildMenuItems(r) });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {inviteTarget ? (
        <InviteAttendDialog
          candidateId={inviteTarget.candidateId}
          name={inviteTarget.name}
          email={inviteTarget.email}
          image={inviteTarget.image}
          alreadyInvited={inviteTarget.alreadyInvited}
          onClose={() => setInviteTarget(null)}
          onInvited={onReload}
        />
      ) : null}
    </div>
  );
}

function KanbanCard({
  row,
  index,
  onOpen,
  onReload,
  isDragging,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: Readonly<{
  row: CandidateRow;
  index: number;
  onOpen: (id: string) => void;
  onReload: () => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}>) {
  const lastIso = row.lastComms?.createdAt ?? null;
  const health = touchHealth(lastIso);
  const ownerFirst = row.owner?.name?.split(' ')[0] ?? row.owner?.email ?? null;
  const sourceLine = row.source === 'REVIEWER_INCENTIVE' && row.derivedStats.reviewerWeekCount != null
    ? `Reviewer ${row.derivedStats.reviewerWeekCount}/30`
    : SOURCE_LABEL[row.source];
  const loc = locationLabel(row);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        // Don't open modal when clicking the editable status field
        if ((e.target as HTMLElement).closest('[data-status-edit]')) return;
        onOpen(row.id);
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('[data-status-edit]')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(row.id);
        }
      }}
      onContextMenu={onContextMenu}
      style={{ ['--row-i' as keyof React.CSSProperties as string]: Math.min(index, 12) } as React.CSSProperties}
      className={`attendance-card group relative w-full text-left bg-brown-800 border-2 border-cream-200/10 hover:border-orange-500/60 hover:bg-orange-500/10 hover:-translate-y-px transition-[transform,border-color,background-color,color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:translate-y-0 active:scale-[0.99] cursor-pointer ${isDragging ? 'opacity-40 border-orange-500/60' : ''}`}
    >
      {/* Identity zone */}
      <div className="flex items-start gap-2.5 min-w-0 px-3 pt-3">
        <Avatar name={row.name} email={row.email} image={row.image} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-cream-50 text-sm font-medium truncate leading-tight">{row.name ?? row.email ?? '?'}</div>
            {row.isGirl ? <span title="Counts toward girl target" className="text-pink-300 text-sm leading-none shrink-0">♀</span> : null}
          </div>
          <div className="text-xs text-cream-300 truncate mt-0.5">
            {sourceLine}
            {ownerFirst ? <span className="text-cream-400"> · Owner: <span className="text-cream-200">{ownerFirst}</span></span> : <span className="text-cream-400"> · No owner</span>}
          </div>
          {loc ? (
            <div className="text-xs text-cream-400 truncate mt-0.5">{loc}</div>
          ) : null}
        </div>
      </div>

      {/* Status note — inline editable */}
      <div className="px-3 pt-3 pb-2.5">
        <StatusNoteField
          candidateId={row.id}
          value={row.statusNote}
          onSaved={onReload}
        />
      </div>

      {/* Bottom row — Attend Status + last touch */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/15 text-xs">
        <AttendStatusPill invited={row.attendInvited} external={!row.userId} />
        <div className="flex items-center gap-1.5 text-cream-300 tabular-nums shrink-0">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${TOUCH_DOT[health]} ${health === 'fresh' ? 'attendance-dot-fresh' : ''}`} aria-hidden />
          <span>{lastIso ? relativeTime(lastIso) : 'no contact'}</span>
        </div>
      </div>
    </div>
  );
}

function AttendStatusPill({ invited, external }: Readonly<{ invited: boolean; external: boolean }>) {
  if (invited) {
    return (
      <span className="inline-flex items-center gap-1 text-green-400 font-medium">
        <span aria-hidden className="text-green-400">✓</span> In Attend
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-cream-400">
      Not in Attend{external ? ' (external)' : ''}
    </span>
  );
}

/**
 * Inline-editable statusNote on the kanban card.
 * Click to edit, Enter / blur to save, Esc to cancel. Doesn't trigger
 * the card click (data-status-edit hooks the parent's stopPropagation).
 */
function StatusNoteField({
  candidateId, value, onSaved,
}: Readonly<{ candidateId: string; value: string | null; onSaved: () => void }>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [editing]);

  async function save() {
    const next = draft.trim();
    if (next === (value ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await fetch(`/api/admin/attendance/${candidateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusNote: next || null }),
      });
      onSaved();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        data-status-edit
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className={`w-full text-left text-sm leading-snug min-h-[1.5rem] cursor-text transition-colors duration-100 ${
          value ? 'text-cream-100 hover:text-orange-300' : 'text-cream-400 italic hover:text-cream-200'
        }`}
        title="Click to edit"
      >
        {value || 'Add status…'}
      </button>
    );
  }

  return (
    <textarea
      ref={inputRef}
      data-status-edit
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const el = inputRef.current;
        if (el) {
          el.style.height = 'auto';
          el.style.height = el.scrollHeight + 'px';
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          setDraft(value ?? '');
          setEditing(false);
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          save();
        }
      }}
      onBlur={() => save()}
      disabled={saving}
      placeholder="What's happening with them right now?"
      rows={1}
      className="w-full bg-brown-900 text-cream-50 text-sm px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset resize-none leading-snug placeholder:text-cream-400 placeholder:italic"
    />
  );
}

function InactiveCard({
  row, onOpen, onContextMenu,
}: Readonly<{ row: CandidateRow; onOpen: (id: string) => void; onContextMenu: (e: React.MouseEvent) => void }>) {
  const isShelved = row.outreachStatus === 'SHELVED';
  return (
    <button
      onClick={() => onOpen(row.id)}
      onContextMenu={onContextMenu}
      className={`w-full text-left bg-brown-800/60 border-2 border-cream-200/10 hover:border-cream-200/30 px-3 py-2 cursor-pointer ${isShelved ? 'opacity-60' : 'opacity-50'}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Avatar name={row.name} email={row.email} image={row.image} size={20} />
        <div className={`flex-1 min-w-0 text-xs ${row.outreachStatus === 'DECLINED' ? 'line-through decoration-cream-300/40' : ''} text-cream-200 truncate`}>
          {row.name ?? row.email ?? '?'}
        </div>
        <span className="text-xs uppercase tracking-widest text-cream-400 font-medium shrink-0">
          {isShelved ? 'shelved' : 'declined'}
        </span>
      </div>
    </button>
  );
}
