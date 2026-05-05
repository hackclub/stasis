'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Avatar } from './Avatar';
import { StatusPill, FlagPill } from './StatusPill';
import { SourceBadge, Dot } from './SourceBadge';
import { CandidateRow, relativeTime, touchHealth, formatDollars } from '../lib/types';
import { DerivedStatLine } from './DerivedStatLine';
import { AttendStatusPill } from './AttendStatusPill';

const TOUCH_DOT: Record<ReturnType<typeof touchHealth>, string> = {
  fresh: 'bg-green-500',
  stale: 'bg-yellow-500',
  cold: 'bg-red-500',
  untouched: 'bg-cream-500/40',
};

export function CandidateTable({
  rows,
  onOpen,
  highlightedId,
  onHighlight,
}: Readonly<{
  rows: CandidateRow[];
  onOpen: (id: string) => void;
  highlightedId?: string | null;
  onHighlight?: (id: string | null) => void;
}>) {
  const sorted = useMemo(() => {
    // Sort: invitedAt desc nulls last, then updatedAt desc
    return [...rows].sort((a, b) => {
      const ai = a.invitedAt ? new Date(a.invitedAt).getTime() : 0;
      const bi = b.invitedAt ? new Date(b.invitedAt).getTime() : 0;
      if (bi !== ai) return bi - ai;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [rows]);
  const highlightedRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (highlightedId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedId]);

  if (sorted.length === 0) {
    return <EmptyState />;
  }
  return (
    <div className="overflow-auto bg-brown-800 h-full">
      <table className="min-w-full text-sm border-separate border-spacing-0">
        <thead className="bg-brown-900 sticky top-0 z-10">
          <tr className="text-left text-xs uppercase tracking-widest text-cream-200">
            <th className="px-4 py-3 font-medium">Person</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Owner</th>
            <th className="px-4 py-3 font-medium">Stats</th>
            <th className="px-4 py-3 font-medium text-right">Stipend</th>
            <th className="px-4 py-3 font-medium">Last touch</th>
            <th className="px-4 py-3 font-medium">Last note</th>
            <th className="px-4 py-3 font-medium">Flags</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => {
            const lastIso = r.lastComms?.createdAt ?? null;
            const health = touchHealth(lastIso);
            const isHighlighted = highlightedId === r.id;
            const zebra = idx % 2 === 1 ? 'bg-brown-900/30' : '';
            const isInactive = r.outreachStatus === 'SHELVED' || r.outreachStatus === 'DECLINED';
            return (
              <tr
                key={r.id}
                data-candidate-row
                ref={isHighlighted ? highlightedRef : null}
                onClick={() => {
                  onHighlight?.(r.id);
                  onOpen(r.id);
                }}
                style={{ ['--row-i' as keyof React.CSSProperties as string]: Math.min(idx, 14) } as React.CSSProperties}
                className={`attendance-row cursor-pointer transition-[background-color,outline-color] duration-150 outline outline-2 -outline-offset-2 ${isHighlighted ? 'bg-orange-500/15 outline-orange-500/60' : `${zebra} outline-transparent hover:bg-orange-500/5`} ${isInactive ? 'opacity-60' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={r.name} email={r.email} image={r.image} size={28} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-cream-50 font-medium truncate">{r.name ?? r.email ?? '?'}</span>
                        {r.userId ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src="/stasis-s.svg" alt="" title="Linked to a Stasis user" className="h-3 w-auto shrink-0 opacity-70" />
                        ) : null}
                        {r.isGirl ? <span title="Counts toward girl target" className="text-pink-300 text-xs">♀</span> : null}
                      </div>
                      <div className="text-xs text-cream-300 truncate tabular-nums flex items-center">
                        {r.email ? <span className="truncate">{r.email}</span> : null}
                        {r.email && r.slackId ? <Dot /> : null}
                        {r.slackId ? <span>{r.slackId}</span> : null}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><StatusPill status={r.outreachStatus} /></td>
                <td className="px-4 py-3"><SourceBadge source={r.source} /></td>
                <td className="px-4 py-3">
                  {r.owner ? (
                    <div className="flex items-center gap-1.5">
                      <Avatar name={r.owner.name} email={r.owner.email} image={r.owner.image} size={20} />
                      <span className="text-cream-200 text-xs">{r.owner.name?.split(' ')[0] ?? r.owner.email}</span>
                    </div>
                  ) : (
                    <span className="text-xs uppercase tracking-widest text-cream-300 font-medium">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-cream-200 text-xs tabular-nums whitespace-nowrap"><DerivedStatLine row={r} /></td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.flightStipendCents == null ? (
                    <span className="text-cream-400 text-xs">—</span>
                  ) : r.flightStipendCents === 0 ? (
                    <span className="text-cream-300 text-xs">$0</span>
                  ) : (
                    <span className="text-orange-400 font-medium">{formatDollars(r.flightStipendCents)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${TOUCH_DOT[health]} ${health === 'fresh' ? 'attendance-dot-fresh' : ''}`} aria-hidden />
                    <span className="text-xs text-cream-100 whitespace-nowrap tabular-nums">
                      {lastIso ? relativeTime(lastIso) : '—'}
                    </span>
                    {r.commsCount > 1 ? (
                      <span className="text-xs text-cream-300 tabular-nums ml-1.5">×{r.commsCount}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-cream-200 max-w-xs">
                  <div className="truncate">
                    {r.notes ? <span className="text-cream-100">{r.notes}</span>
                      : r.lastComms?.text ? r.lastComms.text
                      : '—'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 flex-wrap">
                    {r.attendDisplayState ? <AttendStatusPill state={r.attendDisplayState} rawStatus={r.attendStatus} /> : null}
                    {r.attendFlightBooked ? <FlagPill label="✈" tone="positive" title="Flight booked" /> : null}
                    {!r.userId ? <FlagPill label="ext" title="External — no Stasis account" /> : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-brown-800 p-12 text-center">
      <div className="text-cream-100 text-sm font-medium">No candidates yet.</div>
      <div className="text-cream-300 text-xs mt-1">Click <span className="text-orange-400">+ Add candidate</span> to start tracking someone.</div>
    </div>
  );
}
