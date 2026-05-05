'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { CandidateTable } from './components/CandidateTable';
import { CandidateKanban } from './components/CandidateKanban';
import { CandidateModal } from './components/CandidateModal';
import { AddCandidateDialog } from './components/AddCandidateDialog';
import { SourcingView } from './components/SourcingView';
import { CandidateRow, AdminUser, AttendanceStatus, AttendanceCandidateSource, KANBAN_ORDER, KANBAN_LABEL, kanbanColumnFor, kanbanColumnTone, kanbanColumnAccent } from './lib/types';
import { ColorSelect } from './components/ColorSelect';

type ViewMode = 'kanban' | 'table' | 'sourcing';

interface FilterState {
  q: string;
  status: string;        // '' = all (table only)
  ownerId: string;       // '' = all, 'unassigned'
  source: string;        // '' = all (table + sourcing)
  girls: string;         // '' = all, 'girls', 'non-girls', 'unknown'
}

const DEFAULT_FILTERS: FilterState = {
  q: '',
  status: '',
  ownerId: '',
  source: '',
  girls: '',
};

function readFiltersFromUrl(sp: URLSearchParams): FilterState {
  return {
    q: sp.get('q') ?? '',
    status: sp.get('status') ?? '',
    ownerId: sp.get('owner') ?? '',
    source: sp.get('source') ?? '',
    girls: sp.get('girls') ?? '',
  };
}

function readViewFromUrl(sp: URLSearchParams): ViewMode {
  const v = sp.get('view');
  if (v === 'table' || v === 'sourcing') return v;
  return 'kanban';
}

export default function AttendancePage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => readViewFromUrl(new URLSearchParams(searchParams.toString())));
  const [filters, setFilters] = useState<FilterState>(() => readFiltersFromUrl(new URLSearchParams(searchParams.toString())));
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [adding, setAdding] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement | null>(null);

  // Mirror filters/view/id to URL
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (filters.q) sp.set('q', filters.q);
      if (filters.status) sp.set('status', filters.status);
      if (filters.ownerId) sp.set('owner', filters.ownerId);
      if (filters.source) sp.set('source', filters.source);
      if (filters.girls) sp.set('girls', filters.girls);
      if (view !== 'kanban') sp.set('view', view);
      if (selectedId) sp.set('id', selectedId);
      const qs = sp.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      router.replace(next, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [filters, view, selectedId, pathname, router]);

  const load = useCallback(async () => {
    try {
      const [rowsRes, adminsRes] = await Promise.all([
        fetch('/api/admin/attendance'),
        fetch('/api/admin/attendance/admins'),
      ]);
      if (!rowsRes.ok) throw new Error('Failed to load candidates');
      if (!adminsRes.ok) throw new Error('Failed to load admins');
      const rowsJ = await rowsRes.json();
      const adminsJ = await adminsRes.json();
      setRows(rowsJ.items ?? []);
      setAdmins(adminsJ.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const moveCandidate = useCallback(async (id: string, nextStatus: AttendanceStatus) => {
    let prevStatus: AttendanceStatus | null = null;
    setRows((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      prevStatus = r.outreachStatus;
      return { ...r, outreachStatus: nextStatus };
    }));
    try {
      const res = await fetch(`/api/admin/attendance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreachStatus: nextStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
    } catch (err) {
      if (prevStatus) {
        const reverted = prevStatus;
        setRows((rs) => rs.map((r) => r.id === id ? { ...r, outreachStatus: reverted } : r));
      }
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }, []);

  // Apply filters appropriate to the current view.
  // - kanban: shows only active funnel + (optionally) inactive rail
  // - table: shows everything, status-filterable
  // - sourcing: pinned to status=IDENTIFIED
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (view === 'sourcing' && r.outreachStatus !== 'IDENTIFIED') return false;
      if (view === 'kanban' && r.outreachStatus === 'IDENTIFIED') return false;
      if (q) {
        const hay = [r.name, r.email, r.slackId, r.flakeNote, r.caseForThem, r.lastComms?.text]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (view === 'table' && filters.status && r.outreachStatus !== filters.status) return false;
      if (filters.ownerId === 'unassigned' && r.ownerId) return false;
      if (filters.ownerId && filters.ownerId !== 'unassigned' && r.ownerId !== filters.ownerId) return false;
      if (filters.source && r.source !== filters.source) return false;
      if (filters.girls === 'girls' && r.isGirl !== true) return false;
      if (filters.girls === 'non-girls' && r.isGirl !== false) return false;
      if (filters.girls === 'unknown' && r.isGirl !== null) return false;
      return true;
    });
  }, [rows, filters, view]);

  useEffect(() => {
    if (highlightedId && !filtered.some((r) => r.id === highlightedId)) {
      setHighlightedId(null);
    }
  }, [filtered, highlightedId]);

  // Funnel-strip counts (kanban view): one column per active stage + sourcing tally.
  const funnelCounts = useMemo(() => {
    let sourced = 0, girlsSourced = 0;
    let inactive = 0;
    const byCol = new Map<string, { total: number; girls: number }>();
    for (const c of KANBAN_ORDER) byCol.set(c, { total: 0, girls: 0 });
    for (const r of rows) {
      if (r.outreachStatus === 'IDENTIFIED') {
        sourced += 1;
        if (r.isGirl) girlsSourced += 1;
        continue;
      }
      if (r.outreachStatus === 'DECLINED' || r.outreachStatus === 'SHELVED') {
        inactive += 1;
        continue;
      }
      const col = kanbanColumnFor(r);
      if (!col) continue;
      const cur = byCol.get(col)!;
      cur.total += 1;
      if (r.isGirl) cur.girls += 1;
    }
    // Sums for the % anchor — base on confirmed + booked (the people we'll actually have)
    const confirmed = (byCol.get('CONFIRMED_YES')?.total ?? 0) + (byCol.get('BOOKED_FLIGHT')?.total ?? 0);
    const confirmedGirls = (byCol.get('CONFIRMED_YES')?.girls ?? 0) + (byCol.get('BOOKED_FLIGHT')?.girls ?? 0);
    const stipendCommitted = rows
      .filter((r) => (r.outreachStatus === 'CONFIRMED_YES' || r.outreachStatus === 'CONTACTED' || r.outreachStatus === 'SOFT_YES') && r.flightStipendCents)
      .reduce((s, r) => s + (r.flightStipendCents ?? 0), 0);
    return { sourced, girlsSourced, byCol, inactive, confirmed, confirmedGirls, stipendCommitted };
  }, [rows]);

  // Keyboard shortcuts
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (adding) { setAdding(false); return; }
        if (selectedId) { setSelectedId(null); return; }
        if (filters.q) { setFilters((f) => ({ ...f, q: '' })); return; }
        if (highlightedId) { setHighlightedId(null); return; }
      }
      if (selectedId || adding) return;
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.key === 'n') {
        e.preventDefault();
        setAdding(true);
        return;
      }
      if (e.key === 'v') {
        e.preventDefault();
        setView((v) => (v === 'kanban' ? 'table' : v === 'table' ? 'sourcing' : 'kanban'));
        return;
      }
      if (view !== 'table' || filtered.length === 0) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = highlightedId ? filtered.findIndex((r) => r.id === highlightedId) : -1;
        const next = filtered[Math.min(filtered.length - 1, idx + 1)] ?? filtered[0];
        setHighlightedId(next.id);
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = highlightedId ? filtered.findIndex((r) => r.id === highlightedId) : 0;
        const next = filtered[Math.max(0, idx - 1)] ?? filtered[0];
        setHighlightedId(next.id);
        return;
      }
      if (e.key === 'Enter' && highlightedId) {
        e.preventDefault();
        setSelectedId(highlightedId);
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adding, selectedId, filters.q, highlightedId, filtered, view]);

  useEffect(() => {
    if (!highlightedId || selectedId || adding) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-candidate-row]')) return;
      setHighlightedId(null);
    }
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [highlightedId, selectedId, adding]);

  // Show/hide filter chips based on active view.
  const showStatusFilter = view === 'table';
  const showSourceFilter = view !== 'kanban'; // sourcing + table

  return (
    <div className="font-sans flex flex-col -mb-8 h-[calc(100dvh-9rem)]">
      <header className="mb-4 shrink-0 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3 shrink-0">
          <h1 className="text-cream-50 text-xl font-medium">Attendance</h1>
          <span className="text-xs uppercase tracking-widest text-cream-300 font-medium tabular-nums">
            {rows.length} candidate{rows.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <SegmentedView
            value={view}
            onChange={setView}
            options={[
              { value: 'kanban', label: 'Kanban' },
              { value: 'table', label: 'Table' },
              { value: 'sourcing', label: 'Sourcing' },
            ]}
          />
          <button
            onClick={() => setAdding(true)}
            className="text-xs uppercase tracking-widest font-medium px-3 py-2 bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 cursor-pointer transition-[background-color] duration-150 active:scale-[0.97]"
          >+ Add candidate</button>
        </div>
      </header>

      {/* Funnel strip — kanban view only */}
      {view === 'kanban' ? (
        <div className="mb-4 shrink-0 flex flex-wrap items-stretch gap-2">
          <FunnelChip label="Pool" total={funnelCounts.sourced} girls={funnelCounts.girlsSourced} accent="bg-cream-300/30" tone="text-cream-200" />
          {KANBAN_ORDER.map((col) => {
            const stats = funnelCounts.byCol.get(col)!;
            return (
              <FunnelChip
                key={col}
                label={KANBAN_LABEL[col]}
                total={stats.total}
                girls={stats.girls}
                accent={kanbanColumnAccent(col)}
                tone={kanbanColumnTone(col)}
              />
            );
          })}
          <div className="flex items-stretch gap-2 ml-auto">
            <span className="block w-px self-stretch bg-cream-200/10 mx-1" aria-hidden />
            <GirlTargetChip
              confirmedGirls={funnelCounts.confirmedGirls}
              confirmedTotal={funnelCounts.confirmed}
              targetPct={40}
            />
            <StipendChip cents={funnelCounts.stipendCommitted} />
          </div>
        </div>
      ) : null}

      {/* Toolbar — view-aware filter cluster */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-6 shrink-0">
        <div className="relative w-72">
          <input
            ref={searchRef}
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search name, email, Slack, notes…"
            className="bg-brown-800 text-cream-50 text-xs font-medium px-2.5 py-2 pr-8 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset w-full placeholder:text-cream-400 placeholder:font-normal"
          />
          {!filters.q ? (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center px-1.5 py-px bg-brown-900 text-cream-300 text-xs tabular-nums">/</kbd>
          ) : null}
        </div>
        {showStatusFilter ? (
          <ColorSelect
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            options={[
              { value: '', label: 'Any status' },
              { value: 'IDENTIFIED', label: 'Pool', color: 'cream' },
              { value: 'CONTACTED', label: 'Reached out', color: 'orange' },
              { value: 'SOFT_YES', label: 'Soft yes', color: 'yellow' },
              { value: 'CONFIRMED_YES', label: 'Confirmed yes', color: 'green' },
              { value: 'DECLINED', label: 'Declined', color: 'red' },
              { value: 'SHELVED', label: 'Shelved', color: 'brown' },
            ]}
          />
        ) : null}
        {showSourceFilter ? (
          <ColorSelect
            value={filters.source}
            onChange={(v) => setFilters((f) => ({ ...f, source: v }))}
            options={[
              { value: '', label: 'Any source' },
              { value: 'STASIS_USER', label: 'Source: Stasis', color: 'orange' },
              { value: 'REVIEWER_INCENTIVE', label: 'Source: Reviewer', color: 'purple' },
              { value: 'EXTERNAL_HC', label: 'Source: HC Builder', color: 'blue' },
              { value: 'DISCRETION', label: 'Source: Other', color: 'cream' },
            ]}
          />
        ) : null}
        <ColorSelect
          value={filters.ownerId}
          onChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))}
          options={[
            { value: '', label: 'Any owner' },
            { value: 'unassigned', label: 'Unassigned', color: 'brown' },
            ...admins.map((a) => ({
              value: a.id,
              label: `Owner: ${a.name?.split(' ')[0] ?? a.email}`,
              color: ownerColor(a.id),
            })),
          ]}
        />
        <ColorSelect
          value={filters.girls}
          onChange={(v) => setFilters((f) => ({ ...f, girls: v }))}
          options={[
            { value: '', label: 'Any gender' },
            { value: 'girls', label: 'Girls only', color: 'pink' },
            { value: 'non-girls', label: 'Non-girls', color: 'brown' },
            { value: 'unknown', label: 'Gender unknown', color: 'cream' },
          ]}
        />
      </div>

      {error ? <div className="text-red-400 text-sm mb-3 shrink-0">{error}</div> : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-col gap-px bg-brown-900 h-full overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-brown-800/60 animate-pulse shrink-0" />
            ))}
          </div>
        ) : view === 'kanban' ? (
          <CandidateKanban rows={filtered} onOpen={setSelectedId} onMove={moveCandidate} admins={admins} onReload={load} />
        ) : view === 'sourcing' ? (
          <SourcingView rows={filtered} onOpen={setSelectedId} onReload={load} />
        ) : (
          <CandidateTable rows={filtered} onOpen={setSelectedId} highlightedId={highlightedId} onHighlight={setHighlightedId} />
        )}
      </div>

      <div className="mt-3 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-widest text-cream-300 font-medium tabular-nums shrink-0 bg-brown-950">
        <span>showing {filtered.length} of {rows.length}</span>
        <span className="text-cream-300 normal-case tracking-normal font-normal">
          <Kbd>/</Kbd> search · <Kbd>j</Kbd>/<Kbd>k</Kbd> nav · <Kbd>Enter</Kbd> open · <Kbd>n</Kbd> new · <Kbd>v</Kbd> view · <Kbd>Esc</Kbd> close
        </span>
      </div>

      {selectedId ? (
        <CandidateModal
          candidateId={selectedId}
          admins={admins}
          onClose={() => setSelectedId(null)}
          onMutated={load}
        />
      ) : null}
      {adding ? (
        <AddCandidateDialog
          onClose={() => setAdding(false)}
          onAdded={(id) => { setAdding(false); setSelectedId(id); load(); }}
        />
      ) : null}
    </div>
  );
}

/** Single segmented control — no fake-divider artifacts. */
function SegmentedView<T extends string>({
  value, onChange, options,
}: Readonly<{ value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }>) {
  return (
    <div className="inline-flex items-stretch bg-brown-800 outline outline-1 -outline-offset-1 outline-cream-200/10">
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-xs uppercase tracking-widest font-medium px-4 py-2 cursor-pointer transition-[background-color,color] duration-150 active:scale-[0.97] ${i > 0 ? 'border-l border-cream-200/10' : ''} ${active ? 'bg-orange-500/20 text-orange-400' : 'text-cream-200 hover:text-cream-50 hover:bg-brown-700/40'}`}
          >{opt.label}</button>
        );
      })}
    </div>
  );
}

/**
 * Per-stage funnel chip. Hierarchy via *size*, not tiny copy:
 *   - count is the hero (text-base, semibold, color-toned)
 *   - label sits above in 12px caps
 *   - girl signal is a thin pink progress bar plus a 12px ♀ count
 */
function FunnelChip({
  label, total, girls, accent, tone,
}: Readonly<{ label: string; total: number; girls: number; accent: string; tone: string }>) {
  const active = total > 0;
  const girlPct = total > 0 ? (girls / total) * 100 : 0;
  return (
    <div className={`flex-1 min-w-[140px] flex items-stretch gap-2.5 ${active ? 'bg-brown-800' : 'bg-brown-800/40'}`}>
      <span className={`block w-1.5 shrink-0 ${active ? accent : 'bg-brown-900'}`} aria-hidden />
      <div className="flex-1 min-w-0 py-2 pr-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs uppercase tracking-widest text-cream-200 font-medium truncate">{label}</span>
          <span className={`text-base font-semibold tabular-nums leading-none ${active ? tone : 'text-cream-400'}`}>{total}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 bg-brown-900 relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-pink-400/70"
              style={{ width: active ? `${Math.min(100, girlPct)}%` : 0 }}
              aria-hidden
            />
          </div>
          <span className="text-xs tabular-nums text-pink-300 font-medium shrink-0" title={active ? `${girls} of ${total} girls (${Math.round(girlPct)}%)` : 'no candidates'}>
            ♀ {active ? girls : 0}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Hero readout for the 40% goal — big % number, color-banded. */
function GirlTargetChip({ confirmedGirls, confirmedTotal, targetPct }: Readonly<{ confirmedGirls: number; confirmedTotal: number; targetPct: number }>) {
  const pct = confirmedTotal > 0 ? Math.round((confirmedGirls / confirmedTotal) * 100) : 0;
  const cls = girlPctClass(pct);
  return (
    <div className="bg-brown-800 px-4 py-2 flex flex-col justify-between min-w-[170px]">
      <div className="text-xs uppercase tracking-widest text-cream-300 font-medium">Girls (confirmed)</div>
      <div className={`text-2xl font-semibold tabular-nums leading-none mt-1 ${cls}`}>{pct}%</div>
      <div className="text-xs text-cream-400 mt-1.5 tabular-nums">
        <span className="text-cream-200 font-medium">{confirmedGirls}</span>
        <span className="text-cream-400">/</span>
        <span className="text-cream-300">{confirmedTotal}</span>
        <span className="mx-2 text-cream-400/60">·</span>
        <span>target {targetPct}%</span>
      </div>
    </div>
  );
}

/** Hero readout for committed stipend total — big $ number. */
function StipendChip({ cents }: Readonly<{ cents: number }>) {
  const dollars = Math.round(cents / 100);
  return (
    <div className="bg-brown-800 px-4 py-2 flex flex-col justify-between min-w-[150px]">
      <div className="text-xs uppercase tracking-widest text-cream-300 font-medium">Stipend</div>
      <div className="text-2xl font-semibold tabular-nums leading-none text-orange-400 mt-1">${dollars.toLocaleString()}</div>
      <div className="text-xs text-cream-400 mt-1.5">committed to flights</div>
    </div>
  );
}

function girlPctClass(pct: number): string {
  if (pct >= 40) return 'text-pink-300';
  if (pct >= 30) return 'text-yellow-300';
  return 'text-red-400';
}

const OWNER_PALETTE = ['emerald', 'blue', 'purple', 'pink', 'orange', 'yellow', 'cream'] as const;
function ownerColor(id: string): typeof OWNER_PALETTE[number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return OWNER_PALETTE[h % OWNER_PALETTE.length];
}

function Kbd({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-px bg-brown-800 text-cream-200 text-xs tabular-nums">
      {children}
    </kbd>
  );
}
