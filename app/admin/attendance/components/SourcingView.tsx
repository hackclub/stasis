'use client';

import { Dispatch, SetStateAction, useMemo, useState } from 'react';
import { Avatar } from './Avatar';
import { SourceBadge } from './SourceBadge';
import { AttendanceStatus } from '../lib/types';
import { CandidateRow, earnedBits, relativeTime, locationLabel, locationRegion, fullAddressLines } from '../lib/types';
import { Tooltip } from '@/app/components/Tooltip';
import { DerivedStatLine } from './DerivedStatLine';

type SortKey = 'recent' | 'realBits' | 'projects' | 'hours' | 'reviews';

/**
 * Sourcing view — dense, bulk-action UI for the Identified pool.
 *
 * Different from the table view: bulk select, narrower set of columns oriented
 * around the "should we pull this person in?" decision, sortable by signal.
 */
export function SourcingView({
  rows,
  onOpen,
  onReload,
  selected,
  setSelected,
}: Readonly<{
  rows: CandidateRow[];
  onOpen: (id: string) => void;
  onReload: () => void;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
}>) {
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [working, setWorking] = useState(false);

  const sorted = useMemo(() => {
    const list = [...rows];
    switch (sortKey) {
      case 'realBits': list.sort((a, b) => earnedBits(b.derivedStats) - earnedBits(a.derivedStats)); break;
      case 'projects': list.sort((a, b) => b.derivedStats.projectsSubmitted - a.derivedStats.projectsSubmitted); break;
      case 'hours': list.sort((a, b) => b.derivedStats.totalHoursClaimed - a.derivedStats.totalHoursClaimed); break;
      case 'reviews': list.sort((a, b) => (b.derivedStats.reviewerWeekCount ?? -1) - (a.derivedStats.reviewerWeekCount ?? -1)); break;
      default: list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [rows, sortKey]);

  const allVisibleIds = useMemo(() => sorted.map((r) => r.id), [sorted]);
  const allChecked = selected.size > 0 && allVisibleIds.every((id) => selected.has(id));
  const someChecked = selected.size > 0 && !allChecked;

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      if (allChecked) return new Set();
      return new Set(allVisibleIds);
    });
  }

  async function bulkPromote(target: 'CONTACTED' | 'SHELVED') {
    if (selected.size === 0 || working) return;
    setWorking(true);
    try {
      const res = await fetch('/api/admin/attendance/bulk-promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], targetStatus: target }),
      });
      if (res.ok) {
        setSelected(new Set());
        onReload();
      }
    } finally {
      setWorking(false);
    }
  }

  async function singleMove(id: string, target: AttendanceStatus) {
    if (working) return;
    setWorking(true);
    try {
      await fetch(`/api/admin/attendance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreachStatus: target }),
      });
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      onReload();
    } finally {
      setWorking(false);
    }
  }

  if (sorted.length === 0) {
    return (
      <div className="bg-brown-800 p-12 text-center">
        <div className="text-cream-100 text-sm font-medium">Sourcing pool is empty.</div>
        <div className="text-cream-300 text-xs mt-1">
          Add candidates manually with <span className="text-orange-400">+ Add candidate</span>, or have Claude bulk-import them.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Sort bar */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <span className="text-xs uppercase tracking-widest text-cream-300 font-medium">Sort by</span>
        {([
          ['recent', 'recent'],
          ['realBits', 'real bits'],
          ['projects', 'projects'],
          ['hours', 'hours'],
          ['reviews', 'reviews'],
        ] as Array<[SortKey, string]>).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`text-xs uppercase tracking-widest font-medium px-2.5 py-1.5 cursor-pointer transition-[background-color,color] duration-150 ${sortKey === k ? 'bg-orange-500/20 text-orange-400' : 'bg-brown-800 text-cream-300 hover:text-cream-50'}`}
          >{label}</button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto bg-brown-800">
        <table className="min-w-full text-sm border-separate border-spacing-0">
          <thead className="bg-brown-900 sticky top-0 z-10">
            <tr className="text-left text-xs uppercase tracking-widest text-cream-200">
              <th className="px-3 py-3 font-medium w-10">
                <Checkbox checked={allChecked} indeterminate={someChecked} onChange={toggleAll} />
              </th>
              <th className="px-4 py-3 font-medium">Person</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Stats</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Added</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => {
              const isChecked = selected.has(r.id);
              const zebra = idx % 2 === 1 ? 'bg-brown-900/30' : '';
              return (
                <tr
                  key={r.id}
                  data-candidate-row
                  className={`cursor-pointer transition-[background-color] duration-150 ${isChecked ? 'bg-orange-500/10' : `${zebra} hover:bg-orange-500/5`}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('[data-stop]')) return;
                    onOpen(r.id);
                  }}
                >
                  <td className="px-3 py-3" data-stop>
                    <Checkbox checked={isChecked} onChange={() => toggle(r.id)} />
                  </td>
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
                        <div className="text-xs text-cream-300 truncate tabular-nums">{r.email ?? r.slackId ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><SourceBadge source={r.source} /></td>
                  <td className="px-4 py-3 text-cream-200 text-xs tabular-nums whitespace-nowrap"><DerivedStatLine row={r} /></td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    <LocationCell row={r} />
                  </td>
                  <td className="px-4 py-3 text-xs text-cream-300 tabular-nums whitespace-nowrap">{relativeTime(r.createdAt)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" data-stop>
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); singleMove(r.id, 'CONTACTED'); }}
                        disabled={working}
                        className="text-xs uppercase tracking-widest font-medium text-orange-400 bg-orange-500/15 hover:bg-orange-500/30 px-2.5 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Mark as reached out"
                      >Mark reached out</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); singleMove(r.id, 'SHELVED'); }}
                        disabled={working}
                        className="text-xs uppercase tracking-widest font-medium text-cream-300 hover:text-cream-50 hover:bg-brown-700 px-2.5 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Shelve"
                      >Shelve</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 ? (
        <div className="mt-3 px-3 py-2 flex items-center justify-between gap-3 bg-orange-500/15 outline outline-1 outline-orange-500/40 shrink-0">
          <span className="text-xs uppercase tracking-widest text-orange-300 font-medium tabular-nums">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => bulkPromote('CONTACTED')}
              disabled={working}
              className="text-xs uppercase tracking-widest font-medium text-orange-400 bg-orange-500/15 hover:bg-orange-500/30 px-3 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >Mark as reached out</button>
            <button
              onClick={() => bulkPromote('SHELVED')}
              disabled={working}
              className="text-xs uppercase tracking-widest font-medium text-cream-200 bg-brown-800 hover:bg-brown-700 px-3 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >Shelve</button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs uppercase tracking-widest font-medium text-cream-300 hover:text-cream-50 px-3 py-2 cursor-pointer"
            >Clear</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Location cell with US/Canada (= cheap-to-fly) emphasis. Domestic candidates
 * get bright text + a leading marker; international candidates dim. Hover the
 * label for the full address tooltip when there's more detail to show.
 */
function LocationCell({ row }: Readonly<{ row: CandidateRow }>) {
  const label = locationLabel(row);
  if (!label) return <span className="text-cream-400">—</span>;
  const region = locationRegion(row);
  const lines = fullAddressLines(row);
  const richer = lines.length > 1 || (lines[0] && lines[0] !== label);

  const markerClass =
    region === 'us' ? 'bg-orange-500'
    : region === 'ca' ? 'bg-orange-700'
    : 'bg-brown-800';
  const markerTitle =
    region === 'us' ? 'United States — domestic flight'
    : region === 'ca' ? 'Canada — domestic flight'
    : 'International';

  const inner = (
    <span className="inline-flex items-center gap-1.5 text-cream-300">
      <span
        aria-hidden
        className={`inline-block size-1.5 ${markerClass}`}
        title={markerTitle}
      />
      {label}
    </span>
  );

  return richer ? (
    <Tooltip
      content={
        <div className="space-y-0.5">
          {lines.map((l, i) => (
            <div key={i} className={i === 0 ? 'text-cream-50' : 'text-cream-200'}>{l}</div>
          ))}
        </div>
      }
    >{inner}</Tooltip>
  ) : inner;
}

function Checkbox({ checked, indeterminate, onChange }: Readonly<{ checked: boolean; indeterminate?: boolean; onChange: () => void }>) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className="group/check inline-flex items-center justify-center cursor-pointer outline-none"
    >
      <span
        aria-hidden
        className={`relative inline-flex items-center justify-center size-4 transition-[background-color,box-shadow] duration-150 ${
          checked || indeterminate
            ? 'bg-orange-500 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]'
            : 'bg-brown-950 shadow-[inset_0_0_0_1px] shadow-cream-200/20 group-hover/check:shadow-cream-200/35'
        }`}
      >
        {indeterminate ? (
          <span className="block w-2 h-px bg-brown-950" />
        ) : checked ? (
          <svg viewBox="0 0 10 10" className="size-2.5 text-brown-950" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 5.5 L4 7.5 L8 3" strokeLinecap="square" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}
