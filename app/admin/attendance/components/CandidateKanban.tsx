'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './Avatar';
import { SOURCE_LABEL, SOURCE_FULL_LABEL, CandidateRow, KanbanColumn, AttendanceStatus, AttendanceCandidateSource, AdminUser, KANBAN_ORDER, KANBAN_LABEL, kanbanColumnFor, kanbanColumnTone, kanbanColumnAccent, relativeTime, touchHealth, locationLabel, fullAddressLines, ownerColor, ownerNameTextClass } from '../lib/types';
import { ContextMenu, MenuItem } from './ContextMenu';
import { InviteAttendDialog } from './InviteAttendDialog';
import { LinkStasisUserDialog } from './LinkStasisUserDialog';
import { Tooltip } from './Tooltip';
import { AttendStatusPill } from './AttendStatusPill';

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
  BOOKED_FLIGHT: 'BOOKED_FLIGHT',
};

interface TravelLeg {
  mode: string | null;
  carrier: string | null;
  notes: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  expectedArrivalTime: string | null;
  flightNumber: string | null;
  flightCode: string | null;
  confirmationCode: string | null;
  departureAirport: string | null;
  arrivalAirport: string | null;
  trainDepartureStation: string | null;
  trainArrivalStation: string | null;
  departureStation: string | null;
  arrivalStation: string | null;
  departureCity: string | null;
  arrivalCity: string | null;
  busDepartureLocation: string | null;
  busArrivalLocation: string | null;
  originAddress: string | null;
  otherDetails: string | null;
  isUnaccompaniedMinor: boolean | null;
  passportNationality: string | null;
  visaType: string | null;
  visaNumber: string | null;
}

interface InviteTarget {
  candidateId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  alreadyInvited: boolean;
}

interface LinkTarget {
  candidateId: string;
  candidateName: string | null;
  candidateEmail: string | null;
  candidateImage: string | null;
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
  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);
  const [pendingFlightConfirm, setPendingFlightConfirm] = useState<{
    id: string;
    name: string | null;
    attendStatus: string | null;
    loadingTravel: boolean;
    travel: {
      inbound: TravelLeg | null;
      outbound: TravelLeg | null;
      visaRequired: boolean | null;
      visaStatus: string | null;
    } | null;
  } | null>(null);

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

    // Dropping into BOOKED_FLIGHT is silent only when Attend has a real
    // inbound flight. Otherwise show the confirmation modal — even when
    // onboarding is "complete", because that just means *some* travel is
    // set (could be a train/bus/no-flight mode), and we want the admin to
    // eyeball the data and decide if it's good enough.
    if (col === 'BOOKED_FLIGHT' && !row.attendFlightBooked) {
      setPendingFlightConfirm({
        id, name: row.name, attendStatus: row.attendStatus,
        loadingTravel: true, travel: null,
      });
      fetch(`/api/admin/attendance/${id}/attend-live`)
        .then((r) => r.ok ? r.json() : null)
        .then((j) => {
          setPendingFlightConfirm((prev) => prev && prev.id === id ? {
            ...prev,
            loadingTravel: false,
            travel: j?.attend?.travel ?? null,
          } : prev);
        })
        .catch(() => {
          setPendingFlightConfirm((prev) => prev && prev.id === id ? {
            ...prev, loadingTravel: false,
          } : prev);
        });
      return;
    }

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

  async function setSource(id: string, source: AttendanceCandidateSource) {
    await fetch(`/api/admin/attendance/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });
    onReload();
  }

  function buildSourceMenuItems(row: CandidateRow): MenuItem[] {
    const sources: AttendanceCandidateSource[] = ['STASIS_USER', 'REVIEWER_INCENTIVE', 'EXTERNAL_HC', 'DISCRETION'];
    return sources.map((s) => ({
      label: SOURCE_FULL_LABEL[s],
      disabled: row.source === s,
      onSelect: () => setSource(row.id, s),
    }));
  }

  function buildOwnerMenuItems(row: CandidateRow): MenuItem[] {
    return [
      { label: '— Unassigned —', disabled: row.ownerId === null, onSelect: () => setOwner(row.id, null) },
      ...admins.map((a) => ({
        label: a.name ?? a.email,
        swatchColor: ownerColor(a.id, admins),
        disabled: a.id === row.ownerId,
        onSelect: () => setOwner(row.id, a.id),
      })),
    ];
  }

  function buildMenuItems(row: CandidateRow): MenuItem[] {
    const moves: MenuItem[] = (
      [
        ['IDENTIFIED', 'Pool'],
        ['CONTACTED', 'Reached out'],
        ['SOFT_YES', 'Soft yes'],
        ['CONFIRMED_YES', 'Confirmed yes'],
        ['BOOKED_FLIGHT', 'Travel confirmed'],
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
        swatchColor: ownerColor(a.id, admins),
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
        disabled: !(row.email),
        onSelect: () => setInviteTarget({
          candidateId: row.id,
          name: row.name,
          email: row.email,
          image: row.image,
          alreadyInvited: row.attendInvited,
        }),
      },
      { type: 'separator' },
      ...(row.userId ? [{
        label: 'Open Airtable record',
        hint: '↗',
        onSelect: () => window.open(`/admin/users?search=${encodeURIComponent(row.email ?? '')}`, '_blank'),
      } as MenuItem] : [{
        label: 'Link to Stasis user…',
        onSelect: () => setLinkTarget({
          candidateId: row.id,
          candidateName: row.name,
          candidateEmail: row.email,
          candidateImage: row.image,
        }),
      } as MenuItem]),
      {
        label: 'Open Slack profile',
        hint: '↗',
        disabled: !row.slackId,
        onSelect: () => row.slackId && window.open(`https://hackclub.enterprise.slack.com/team/${row.slackId}`, '_blank'),
      },
      {
        label: 'Copy email',
        disabled: !row.email,
        onSelect: () => row.email && navigator.clipboard?.writeText(row.email).catch(() => {}),
      },
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
                    admins={admins}
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
                    onEditOwner={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, items: buildOwnerMenuItems(r) });
                    }}
                    onEditSource={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, items: buildSourceMenuItems(r) });
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

      {linkTarget ? (
        <LinkStasisUserDialog
          target={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={onReload}
        />
      ) : null}

      {pendingFlightConfirm ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          onClick={() => setPendingFlightConfirm(null)}
        >
          <div className="attendance-modal-backdrop absolute inset-0 bg-black/70" />
          <div
            className="attendance-modal-drawer relative bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-5 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-cream-50 text-sm font-medium mb-1">
              Mark flight booked for {pendingFlightConfirm.name ?? 'this candidate'}?
            </div>
            <div className="text-cream-300 text-xs mb-3 leading-relaxed">
              Attend doesn&apos;t have a confirmed inbound flight on file
              {pendingFlightConfirm.attendStatus
                ? <> (onboarding status: <span className="text-cream-100">{pendingFlightConfirm.attendStatus}</span>)</>
                : null}. Look over what they&apos;ve set below and decide if it&apos;s enough.
            </div>
            <FlightConfirmTravelPanel
              loading={pendingFlightConfirm.loadingTravel}
              travel={pendingFlightConfirm.travel}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setPendingFlightConfirm(null)}
                className="text-xs uppercase tracking-widest font-medium text-cream-200 hover:text-cream-50 bg-brown-800 px-3 py-2 cursor-pointer"
              >Cancel</button>
              <button
                type="button"
                onClick={() => {
                  const id = pendingFlightConfirm.id;
                  setPendingFlightConfirm(null);
                  onMove?.(id, 'BOOKED_FLIGHT');
                }}
                className="text-xs uppercase tracking-widest font-medium text-orange-300 bg-orange-500/20 hover:bg-orange-500/30 px-3 py-2 cursor-pointer"
              >Mark booked</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Compact travel readout for the BOOKED_FLIGHT confirmation modal. Shows
 *  whatever Attend has on file (mode, carrier, codes, airports, times, visa)
 *  so the admin can decide if it's enough to call "booked." */
function FlightConfirmTravelPanel({
  loading, travel,
}: Readonly<{
  loading: boolean;
  travel: {
    inbound: TravelLeg | null;
    outbound: TravelLeg | null;
    visaRequired: boolean | null;
    visaStatus: string | null;
  } | null;
}>) {
  if (loading) {
    return <div className="h-16 bg-cream-600/15 animate-pulse" aria-label="Loading travel info" />;
  }
  const hasInbound = !!travel?.inbound;
  const hasOutbound = !!travel?.outbound;
  if (!hasInbound && !hasOutbound) {
    return (
      <div className="text-xs bg-brown-800 px-3 py-2.5 text-cream-300 italic">
        No travel info recorded in Attend yet.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {hasInbound ? <TravelLegRow direction="Inbound" leg={travel!.inbound!} /> : null}
      {hasOutbound ? <TravelLegRow direction="Outbound" leg={travel!.outbound!} /> : null}
      {travel?.visaRequired ? (
        <div className="text-xs text-cream-300">
          <span className="text-cream-400">Visa:</span> {travel.visaStatus ?? 'required'}
        </div>
      ) : null}
    </div>
  );
}

/** Render every populated field on a travel leg as a labeled key/value row.
 *  Different `mode` values populate different fields (flight vs train vs bus
 *  vs car vs other), so we discover what's there rather than hardcoding. */
function TravelLegRow({ direction, leg }: Readonly<{ direction: string; leg: TravelLeg }>) {
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleString() : null;

  // Order matters — most distinguishing fields first per mode.
  const ordered: Array<[string, string | null]> = [
    ['Mode', leg.mode],
    ['Carrier', leg.carrier],
    // Flight
    ['Flight', leg.flightCode ?? leg.flightNumber],
    ['Confirmation', leg.confirmationCode],
    ['From airport', leg.departureAirport],
    ['To airport', leg.arrivalAirport],
    // Train
    ['From station', leg.trainDepartureStation ?? leg.departureStation],
    ['To station', leg.trainArrivalStation ?? leg.arrivalStation],
    // Bus
    ['From (bus)', leg.busDepartureLocation],
    ['To (bus)', leg.busArrivalLocation],
    // Cities (train, car)
    ['From city', leg.departureCity],
    ['To city', leg.arrivalCity],
    // Car / other
    ['Origin address', leg.originAddress],
    ['Other details', leg.otherDetails],
    // Times
    ['Departs', fmtDate(leg.departureTime)],
    ['Arrives', fmtDate(leg.arrivalTime)],
    ['Expected arrival', fmtDate(leg.expectedArrivalTime)],
    // Misc
    ['Unaccompanied minor', leg.isUnaccompaniedMinor ? 'yes' : null],
    ['Passport', leg.passportNationality],
    ['Visa type', leg.visaType],
    ['Visa number', leg.visaNumber],
    ['Notes', leg.notes],
  ];
  const populated = ordered.filter(([, v]) => v != null && v !== '');

  return (
    <div className="text-xs bg-brown-800 px-3 py-2.5">
      <div className="text-cream-300 uppercase tracking-widest text-xs font-medium mb-1.5">{direction}</div>
      {populated.length === 0 ? (
        <div className="text-cream-300 italic">No fields set on this leg.</div>
      ) : (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
          {populated.map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-cream-400">{label}</dt>
              <dd className="text-cream-100 break-words">{value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}

function KanbanCard({
  row,
  index,
  admins,
  onOpen,
  onReload,
  isDragging,
  onDragStart,
  onDragEnd,
  onContextMenu,
  onEditOwner,
  onEditSource,
}: Readonly<{
  row: CandidateRow;
  index: number;
  admins: AdminUser[];
  onOpen: (id: string) => void;
  onReload: () => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onEditOwner: (e: React.MouseEvent) => void;
  onEditSource: (e: React.MouseEvent) => void;
}>) {
  const lastIso = row.lastComms?.createdAt ?? null;
  const health = touchHealth(lastIso);
  const [quickCommsAnchor, setQuickCommsAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const ownerFirst = row.owner?.name?.split(' ')[0] ?? row.owner?.email ?? null;
  const sourceValue = row.source === 'REVIEWER_INCENTIVE' && row.derivedStats.reviewerWeekCount != null
    ? `Reviewer · ${row.derivedStats.reviewerWeekCount}/30`
    : SOURCE_LABEL[row.source];
  const loc = locationLabel(row);
  // `dragstart` fires on the draggable element itself, so its target is
  // always the parent card — we can't tell which descendant the gesture
  // actually started on by looking at the dragstart event alone. Capture
  // the mousedown target and (a) flip `draggable` to false synchronously
  // so the browser doesn't initiate a drag at all when the gesture starts
  // inside a `data-no-drag` zone, and (b) hard-cancel any drag that does
  // slip through via preventDefault.
  const cardRef = useRef<HTMLDivElement>(null);
  const dragStartTargetRef = useRef<EventTarget | null>(null);
  // Tracked manually instead of using CSS `:active` so a press inside a
  // `data-no-drag` zone (e.g. the inline notes textarea) doesn't shrink the
  // whole card while the user is just trying to position the cursor.
  const [pressed, setPressed] = useState(false);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      draggable
      onMouseDown={(e) => {
        dragStartTargetRef.current = e.target;
        const inNoDrag = (e.target as HTMLElement).closest('[data-no-drag]');
        cardRef.current?.setAttribute('draggable', inNoDrag ? 'false' : 'true');
        if (!inNoDrag) setPressed(true);
      }}
      onMouseUp={() => {
        cardRef.current?.setAttribute('draggable', 'true');
        setPressed(false);
      }}
      onMouseLeave={() => setPressed(false)}
      onDragStart={(e) => {
        const origin = dragStartTargetRef.current as HTMLElement | null;
        if (origin && origin.closest('[data-no-drag]')) {
          e.preventDefault();
          return;
        }
        onDragStart(e);
      }}
      onDragEnd={(e) => { setPressed(false); onDragEnd(e); }}
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
      className={`attendance-card group relative w-full text-left bg-brown-800 border-2 border-cream-200/10 hover:border-orange-500/60 hover:bg-orange-500/10 hover:-translate-y-px transition-[transform,border-color,background-color,color,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer ${pressed ? 'translate-y-0 scale-[0.99]' : ''} ${isDragging ? 'opacity-40 border-orange-500/60' : ''}`}
    >
      {/* Identity zone */}
      <div className="flex items-start gap-2.5 min-w-0 px-3 pt-3">
        <Avatar name={row.name} email={row.email} image={row.image} size={32} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-cream-50 text-sm font-medium truncate leading-tight">{row.name ?? row.email ?? '?'}</div>
            {row.userId ? (
              <Tooltip content={<>Linked to a <span className="text-orange-300">Stasis user</span> — derived stats (bits, hours, projects) are pulled from their account.</>}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/stasis-s.svg" alt="" className="h-3 w-auto shrink-0 ml-0.5 opacity-70" />
              </Tooltip>
            ) : null}
            {row.isGirl ? (
              <Tooltip content={<>Counts toward the <span className="text-pink-300">40% girls</span> target for the event.</>}>
                <span className="text-pink-300 text-sm leading-none shrink-0 ">♀</span>
              </Tooltip>
            ) : null}
          </div>
          <div className="text-xs text-cream-400 mt-0.5 leading-snug break-words">
            <span>Source: </span>
            <button
              type="button"
              data-inline-edit
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEditSource(e); }}
              className="text-cream-200 hover:text-orange-300 cursor-pointer"
            >
              {sourceValue}
            </button>
            {' · '}
            {ownerFirst && row.ownerId ? (
              <>
                <button
                  type="button"
                  data-inline-edit
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onEditOwner(e); }}
                  className={`font-medium hover:text-orange-300 cursor-pointer ${ownerNameTextClass(row.ownerId, admins)}`}
                >
                  {ownerFirst}
                </button>
              </>
            ) : (
              <button
                type="button"
                data-inline-edit
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onEditOwner(e); }}
                className="hover:text-orange-300 cursor-pointer"
              >
                No owner
              </button>
            )}
          </div>
          {loc ? (() => {
            const lines = fullAddressLines(row);
            const richer = lines.length > 1 || (lines[0] && lines[0] !== loc);
            const node = <span className="text-xs text-cream-400 truncate mt-0.5 block">{loc}</span>;
            return richer ? (
              <Tooltip
                content={
                  <div className="space-y-0.5">
                    {lines.map((l, i) => (
                      <div key={i} className={i === 0 ? 'text-cream-50' : 'text-cream-200'}>{l}</div>
                    ))}
                  </div>
                }
              >{node}</Tooltip>
            ) : node;
          })() : null}
        </div>
      </div>

      {/* Notes — inline editable */}
      <div className="px-3 pt-3 pb-2.5">
        <NotesField
          candidateId={row.id}
          value={row.notes}
          onSaved={onReload}
        />
      </div>

      {/* Bottom row — Attend Status + last touch */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-black/15 text-xs">
        {row.attendDisplayState ? (
          <AttendStatusPill state={row.attendDisplayState} rawStatus={row.attendStatus} />
        ) : (
          <Tooltip content={<>Not yet invited on <span className="text-cream-100">attend.hackclub.com</span>. Right-click → <span className="text-cream-100">Send Attend invite</span> when ready.</>}>
            <span className="inline-flex items-center gap-1 text-cream-400">Not in Attend</span>
          </Tooltip>
        )}
        <Tooltip content={
          lastIso
            ? <>Last communication log entry on this candidate ({relativeTime(lastIso)}). Click to add a new entry. Dot color: <span className="text-green-400">green</span> ≤3d, <span className="text-yellow-400">yellow</span> ≤7d, <span className="text-red-400">red</span> &gt;7d.</>
            : <>No communication log entries yet. Click to add one.</>
        }>
          <button
            type="button"
            data-status-edit
            data-no-drag
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setQuickCommsAnchor({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
            }}
            className="flex items-center gap-1.5 text-cream-300 hover:text-orange-200 tabular-nums shrink-0 px-1.5 -mx-1.5 py-0.5 -my-0.5 hover:bg-orange-500/10 transition-colors duration-100 cursor-pointer"
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${TOUCH_DOT[health]} ${health === 'fresh' ? 'attendance-dot-fresh' : ''}`} aria-hidden />
            <span>{lastIso ? relativeTime(lastIso) : 'no contact'}</span>
          </button>
        </Tooltip>
      </div>

      {quickCommsAnchor ? (
        <QuickCommsPopover
          candidateId={row.id}
          anchor={quickCommsAnchor}
          onClose={() => setQuickCommsAnchor(null)}
          onSaved={onReload}
        />
      ) : null}
    </div>
  );
}

/**
 * Click-to-log popover anchored to the comms-status display on a kanban card.
 * Lets the admin append a free-text comms entry without opening the full modal.
 * Enter sends, Shift+Enter newline, Esc closes. Click-outside closes.
 */
function QuickCommsPopover({
  candidateId, anchor, onClose, onSaved,
}: Readonly<{
  candidateId: string;
  anchor: { x: number; y: number; width: number; height: number };
  onClose: () => void;
  onSaved: () => void;
}>) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => taRef.current?.focus());
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  async function submit() {
    const text = draft.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/attendance/${candidateId}/comms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to log');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setSubmitting(false);
    }
  }

  const width = 320;
  const padding = 8;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  let x = anchor.x + anchor.width - width;
  if (x < padding) x = padding;
  if (x + width > vw - padding) x = vw - width - padding;
  const placeAbove = anchor.y > 180;
  const style: React.CSSProperties = placeAbove
    ? { left: x, bottom: vh - anchor.y + 6, width }
    : { left: x, top: anchor.y + anchor.height + 6, width };

  return createPortal(
    <div
      ref={popRef}
      style={style}
      className="fixed z-[10000] bg-brown-900 border-2 border-orange-500/60 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const el = taRef.current;
          if (el) {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
          }
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
          if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Log a comms update…"
        rows={2}
        disabled={submitting}
        className="w-full bg-transparent text-cream-50 placeholder:text-cream-400 placeholder:italic px-3 py-2.5 text-sm resize-none focus:outline-none focus-visible:outline-none"
      />
      <div className="flex items-center justify-between bg-black/15 px-3 py-1.5">
        <span className="text-xs uppercase tracking-widest font-medium text-cream-300">
          Enter sends · Esc cancels
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || submitting}
          className="text-xs uppercase tracking-widest font-medium text-orange-400 hover:text-orange-300 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1 cursor-pointer"
        >
          {submitting ? 'Logging…' : 'Log'}
        </button>
      </div>
      {error ? <div className="text-xs text-red-400 px-3 pb-2">{error}</div> : null}
    </div>,
    document.body
  );
}

/**
 * Inline-editable notes on the kanban card.
 * Click to edit, Enter / blur to save, Esc to cancel. Doesn't trigger
 * the card click (data-status-edit hooks the parent's stopPropagation).
 */
function NotesField({
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
        body: JSON.stringify({ notes: next || null }),
      });
      onSaved();
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (!editing) {
    // `data-no-drag` is read by the parent KanbanCard's onDragStart and
    // cancels the card drag for gestures that originate inside the notes.
    // Click → edit, but only if no text was selected by the gesture (so a
    // real selection drag doesn't immediately collapse into edit mode).
    return (
      <div
        data-status-edit
        data-no-drag
        onClick={(e) => {
          e.stopPropagation();
          const sel = window.getSelection();
          if (sel && sel.toString().length > 0) return; // user is selecting, leave alone
          setEditing(true);
        }}
        title="Click to edit"
        className={`w-full text-left text-sm leading-snug min-h-[1.75rem] px-2 py-1 cursor-text whitespace-pre-wrap break-words select-text transition-[background-color,border-color] duration-100 border-2 border-transparent hover:border-cream-200/20 hover:bg-brown-900 ${
          value ? 'text-cream-100' : 'text-cream-400 italic'
        }`}
      >
        {value || 'Add notes…'}
      </div>
    );
  }

  return (
    <div
      data-no-drag
      onClick={(e) => e.stopPropagation()}
    >
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
        placeholder="Add notes…"
        rows={1}
        className="w-full bg-brown-900 text-cream-50 text-sm px-2 py-1 border-2 border-orange-500/60 outline-none resize-none leading-snug placeholder:text-cream-400 placeholder:italic"
      />
    </div>
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
