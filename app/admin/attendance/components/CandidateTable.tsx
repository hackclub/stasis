'use client';

import { useMemo } from 'react';
import { Avatar } from './Avatar';
import { StatusPill, FlagPill } from './StatusPill';
import { CandidateRow, relativeTime, touchHealth } from '../lib/types';

const TOUCH_DOT: Record<ReturnType<typeof touchHealth>, string> = {
  fresh: 'bg-green-500',
  stale: 'bg-yellow-500',
  cold: 'bg-red-500',
  untouched: 'bg-cream-500/40',
};

export function CandidateTable({
  rows,
  onOpen,
}: Readonly<{
  rows: CandidateRow[];
  onOpen: (id: string) => void;
}>) {
  const sorted = useMemo(() => rows, [rows]);
  if (sorted.length === 0) {
    return <EmptyState />;
  }
  return (
    <div className="border border-brown-700 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-brown-800/60 border-b border-brown-700">
          <tr className="text-left text-[10px] uppercase tracking-wider text-cream-400 font-mono">
            <th className="px-4 py-2.5 font-normal">Person</th>
            <th className="px-4 py-2.5 font-normal">Status</th>
            <th className="px-4 py-2.5 font-normal">Owner</th>
            <th className="px-4 py-2.5 font-normal text-right">Effort</th>
            <th className="px-4 py-2.5 font-normal">Last touch</th>
            <th className="px-4 py-2.5 font-normal">Notes</th>
            <th className="px-4 py-2.5 font-normal">Flags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brown-700/60">
          {sorted.map((r) => {
            const lastIso = r.lastComms?.createdAt ?? null;
            const health = touchHealth(lastIso);
            const isSnoozed = !!r.snoozedUntil && new Date(r.snoozedUntil) > new Date();
            return (
              <tr
                key={r.id}
                onClick={() => onOpen(r.id)}
                className={`hover:bg-brown-800/40 cursor-pointer transition-colors ${isSnoozed ? 'opacity-60' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={r.name} email={r.email} image={r.image} size={28} />
                    <div className="min-w-0">
                      <div className="text-cream-50 truncate">{r.name ?? r.email ?? '?'}</div>
                      <div className="text-[10px] text-cream-400 font-mono truncate">
                        {r.email}{r.slackId ? ` · ${r.slackId}` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><StatusPill status={r.outreachStatus} /></td>
                <td className="px-4 py-3">
                  {r.owner ? (
                    <div className="flex items-center gap-1.5">
                      <Avatar name={r.owner.name} email={r.owner.email} image={r.owner.image} size={20} />
                      <span className="text-cream-200 text-xs">{r.owner.name?.split(' ')[0] ?? r.owner.email}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wider text-cream-400 font-mono">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-cream-100">
                  {r.realBits > 0 ? (
                    <span title="Real bits (project approvals only, no admin grants)">{r.realBits}b</span>
                  ) : (
                    <span className="text-cream-400">0</span>
                  )}
                  {r.projectCount > 0 ? (
                    <span className="text-cream-400 text-[10px] ml-1">/{r.projectCount}p</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${TOUCH_DOT[health]}`} aria-hidden />
                    <span className="text-xs text-cream-200 font-mono whitespace-nowrap">
                      {lastIso ? relativeTime(lastIso) : '—'}
                    </span>
                    {r.commsCount > 1 ? (
                      <span className="text-[10px] text-cream-400 font-mono">·{r.commsCount}</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-cream-200 max-w-xs">
                  <div className="truncate">
                    {r.lastComms?.text ? r.lastComms.text : (r.flakeNote ? <span className="italic text-cream-400">{r.flakeNote}</span> : '—')}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 flex-wrap">
                    {r.attendInvited ? <FlagPill label="A" tone="positive" /> : null}
                    {r.attendFlightBooked ? <FlagPill label="✈" tone="positive" /> : null}
                    {isSnoozed ? <FlagPill label="zz" tone="snooze" /> : null}
                    {!r.userId ? <FlagPill label="ext" /> : null}
                    {r.remindersCount > 0 ? <FlagPill label={`${r.remindersCount}r`} tone="caution" /> : null}
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
    <div className="border border-dashed border-brown-700 p-12 text-center">
      <div className="text-cream-200 text-sm">No candidates yet.</div>
      <div className="text-cream-400 text-xs mt-1">Click <span className="font-mono text-orange-400">+ Add candidate</span> to start tracking someone.</div>
    </div>
  );
}
