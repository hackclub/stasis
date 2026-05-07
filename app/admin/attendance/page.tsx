'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { CandidateTable } from './components/CandidateTable';
import { CandidateKanban } from './components/CandidateKanban';
import { CandidateModal } from './components/CandidateModal';
import { AddCandidateDialog } from './components/AddCandidateDialog';
import { SourcingView } from './components/SourcingView';
import { HelpModal } from './components/HelpModal';
import { CandidateRow, AdminUser, AttendanceStatus, AttendanceCandidateSource, KANBAN_ORDER, KANBAN_LABEL, kanbanColumnFor, kanbanColumnTone, kanbanColumnAccent, ownerColor, relativeTime } from './lib/types';
import { ColorSelect } from './components/ColorSelect';
import { useRoles, Permission, Role } from '@/lib/hooks/useRoles';

type ViewMode = 'kanban' | 'table' | 'sourcing';

interface FilterState {
  q: string;
  status: string;        // '' = all (table only)
  ownerId: string;       // '' = all, 'unassigned'
  source: string;        // '' = all
  girls: string;         // '' = all, 'girls', 'non-girls', 'unknown'
  attend: string;        // '' = all, 'invited' | 'wip' | 'complete' | 'none'
}

const DEFAULT_FILTERS: FilterState = {
  q: '',
  status: '',
  ownerId: '',
  source: '',
  girls: '',
  attend: '',
};

function readFiltersFromUrl(sp: URLSearchParams): FilterState {
  return {
    q: sp.get('q') ?? '',
    status: sp.get('status') ?? '',
    ownerId: sp.get('owner') ?? '',
    source: sp.get('source') ?? '',
    girls: sp.get('girls') ?? '',
    attend: sp.get('attend') ?? '',
  };
}

function readViewFromUrl(sp: URLSearchParams): ViewMode {
  const v = sp.get('view');
  if (v === 'table' || v === 'sourcing') return v;
  return 'kanban';
}

function readSourcingSelectionFromUrl(sp: URLSearchParams): Set<string> {
  const raw = sp.get('sel');
  if (!raw) return new Set();
  return new Set(raw.split(',').filter(Boolean));
}

export default function AttendancePage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const { isLoading: rolesLoading, hasPermission, hasRole } = useRoles();
  const allowed = hasPermission(Permission.MANAGE_ATTENDANCE);
  useEffect(() => {
    if (!rolesLoading && !allowed) {
      router.replace(hasRole(Role.ADMIN) ? '/admin' : '/dashboard');
    }
  }, [rolesLoading, allowed, hasRole, router]);

  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [stipendSummary, setStipendSummary] = useState<{
    totalApprovedCents: number;
    unmatchedCount: number;
    airtableUrl: string;
  } | null>(null);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(() => readViewFromUrl(new URLSearchParams(searchParams.toString())));
  // Filters are kept in two separate bags so switching between the sourcing
  // view and kanban/table doesn't carry over filter state — each surface has
  // a different decision frame, and the toolbars are tuned per-view.
  const [mainFilters, setMainFilters] = useState<FilterState>(() => {
    const sp = new URLSearchParams(searchParams.toString());
    return readViewFromUrl(sp) === 'sourcing' ? DEFAULT_FILTERS : readFiltersFromUrl(sp);
  });
  const [sourcingFilters, setSourcingFilters] = useState<FilterState>(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (readViewFromUrl(sp) !== 'sourcing') return DEFAULT_FILTERS;
    return { ...readFiltersFromUrl(sp), attend: '' };
  });
  const filters = view === 'sourcing' ? sourcingFilters : mainFilters;
  const setFilters: Dispatch<SetStateAction<FilterState>> = view === 'sourcing' ? setSourcingFilters : setMainFilters;
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [sourcingSelected, setSourcingSelected] = useState<Set<string>>(() => readSourcingSelectionFromUrl(new URLSearchParams(searchParams.toString())));
  const [adding, setAdding] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [hideChrome, setHideChrome] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [syncAll, setSyncAll] = useState<{
    state: 'idle' | 'running' | 'error';
    error: string | null;
    lastResult: { scanned: number; updated: number; bumped: number; created: number; errors: number } | null;
    lastRunAt: string | null;
  }>({ state: 'idle', error: null, lastResult: null, lastRunAt: null });
  const [slackSync, setSlackSync] = useState<{
    state: 'idle' | 'running' | 'error';
    error: string | null;
    lastResult: { invited: number; alreadyIn: number; skippedNoSlackId: number; failed: number } | null;
    lastRunAt: string | null;
  }>({ state: 'idle', error: null, lastResult: null, lastRunAt: null });

  const searchRef = useRef<HTMLInputElement | null>(null);

  // Toggle admin nav visibility — persisted to localStorage, applied as a class
  // on <html> so the layout's chrome elements (header + tab bar) can collapse.
  useEffect(() => {
    const stored = localStorage.getItem('attendance:hideChrome') === '1';
    setHideChrome(stored);
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    if (hideChrome) html.classList.add('hide-admin-chrome');
    else html.classList.remove('hide-admin-chrome');
    localStorage.setItem('attendance:hideChrome', hideChrome ? '1' : '0');
    return () => { html.classList.remove('hide-admin-chrome'); };
  }, [hideChrome]);

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
      if (filters.attend) sp.set('attend', filters.attend);
      if (view !== 'kanban') sp.set('view', view);
      if (selectedId) sp.set('id', selectedId);
      if (view === 'sourcing' && sourcingSelected.size > 0) {
        sp.set('sel', [...sourcingSelected].join(','));
      }
      const qs = sp.toString();
      const next = qs ? `${pathname}?${qs}` : pathname;
      router.replace(next, { scroll: false });
    }, 250);
    return () => clearTimeout(t);
  }, [filters, view, selectedId, sourcingSelected, pathname, router]);

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
      setStipendSummary(rowsJ.stipendSummary ?? null);
      setAdmins(adminsJ.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const runSyncAll = useCallback(async () => {
    setSyncAll((s) => ({ ...s, state: 'running', error: null }));
    try {
      const res = await fetch('/api/admin/attendance/sync-all', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? `Sync failed (${res.status})`);
      }
      setSyncAll({
        state: 'idle',
        error: null,
        lastResult: {
          scanned: body.scanned ?? 0,
          updated: body.updated ?? 0,
          bumped: body.bumped ?? 0,
          created: body.created ?? 0,
          errors: Array.isArray(body.errors) ? body.errors.length : 0,
        },
        lastRunAt: body.syncedAt ?? new Date().toISOString(),
      });
      await load();
    } catch (err) {
      setSyncAll((s) => ({
        ...s,
        state: 'error',
        error: err instanceof Error ? err.message : 'Sync failed',
      }));
    }
  }, [load]);

  const runSlackSync = useCallback(async () => {
    setSlackSync((s) => ({ ...s, state: 'running', error: null }));
    try {
      const res = await fetch('/api/admin/attendance/sync-slack-channel', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ?? `Slack sync failed (${res.status})`);
      }
      setSlackSync({
        state: 'idle',
        error: null,
        lastResult: {
          invited: body.invited ?? 0,
          alreadyIn: body.alreadyIn ?? 0,
          skippedNoSlackId: body.skippedNoSlackId ?? 0,
          failed: body.failed ?? 0,
        },
        lastRunAt: body.syncedAt ?? new Date().toISOString(),
      });
    } catch (err) {
      setSlackSync((s) => ({
        ...s,
        state: 'error',
        error: err instanceof Error ? err.message : 'Slack sync failed',
      }));
    }
  }, []);

  // Newest server-side cache timestamp across all rows. Used as a fallback
  // "last sync" indicator before the user runs sync-all themselves this session.
  const newestServerSync = useMemo(() => {
    let max = 0;
    for (const r of rows) {
      if (!r.attendCachedAt) continue;
      const t = Date.parse(r.attendCachedAt);
      if (t > max) max = t;
    }
    return max > 0 ? new Date(max).toISOString() : null;
  }, [rows]);

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
        const hay = [r.name, r.email, r.slackId, r.notes, r.lastComms?.text]
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
      if (filters.attend) {
        const state = r.attendDisplayState;
        if (filters.attend === 'none' ? state !== null : state !== filters.attend) return false;
      }
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
    return { sourced, girlsSourced, byCol, inactive, confirmed, confirmedGirls };
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
        if (showHelp) { setShowHelp(false); return; }
        if (adding) { setAdding(false); return; }
        if (selectedId) { setSelectedId(null); return; }
        if (filters.q) { setFilters((f) => ({ ...f, q: '' })); return; }
        if (highlightedId) { setHighlightedId(null); return; }
      }
      if (showHelp) return;
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setShowHelp(true);
        return;
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
  }, [adding, selectedId, filters.q, highlightedId, filtered, view, showHelp]);

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
  const showSourceFilter = true;
  const showAttendFilter = view !== 'sourcing';

  if (rolesLoading || !allowed) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="attendance-page-root font-sans flex flex-col">
      <header className="mb-4 shrink-0 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-3 shrink-0">
          <h1 className="text-cream-50 text-xl font-medium">Attendance</h1>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setHideChrome((v) => !v)}
            title={hideChrome ? 'Show admin nav' : 'Hide admin nav for more screen space'}
            className="text-xs uppercase tracking-widest font-medium px-3 py-2 bg-brown-800 text-cream-300 hover:text-cream-50 cursor-pointer transition-[color,background-color] duration-150 active:scale-[0.97]"
          >{hideChrome ? '↓ Show nav' : '↑ Hide nav'}</button>
          <SegmentedView
            value={view}
            onChange={setView}
            options={[
              { value: 'kanban', label: 'Kanban' },
              { value: 'table', label: 'Table' },
              { value: 'sourcing', label: 'Sourcing' },
            ]}
          />
          <SyncAllButton
            state={syncAll.state}
            error={syncAll.error}
            lastResult={syncAll.lastResult}
            lastRunAt={syncAll.lastRunAt ?? newestServerSync}
            onRun={runSyncAll}
            onDismissError={() => setSyncAll((s) => ({ ...s, state: 'idle', error: null }))}
          />
          <SlackSyncButton
            state={slackSync.state}
            error={slackSync.error}
            lastResult={slackSync.lastResult}
            lastRunAt={slackSync.lastRunAt}
            onRun={runSlackSync}
            onDismissError={() => setSlackSync((s) => ({ ...s, state: 'idle', error: null }))}
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
              girlTarget={40}
            />
            <StipendChip summary={stipendSummary} />
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
              { value: 'BOOKED_FLIGHT', label: 'Travel confirmed', color: 'emerald' },
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
              color: ownerColor(a.id, admins),
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
        {showAttendFilter ? (
          <ColorSelect
            value={filters.attend}
            onChange={(v) => setFilters((f) => ({ ...f, attend: v }))}
            options={[
              { value: '', label: 'Any attend status' },
              { value: 'invited', label: 'Attend invited', color: 'yellow' },
              { value: 'wip', label: 'Attend WIP', color: 'orange' },
              { value: 'complete', label: 'Attend complete', color: 'green' },
              { value: 'none', label: 'Not in Attend', color: 'brown' },
            ]}
          />
        ) : null}
      </div>

      {error ? <div className="text-red-400 text-sm mb-3 shrink-0">{error}</div> : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-col gap-px bg-brown-900 h-full overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-cream-600/20 animate-pulse shrink-0" />
            ))}
          </div>
        ) : view === 'kanban' ? (
          <CandidateKanban rows={filtered} onOpen={setSelectedId} onMove={moveCandidate} admins={admins} onReload={load} />
        ) : view === 'sourcing' ? (
          <SourcingView rows={filtered} onOpen={setSelectedId} onReload={load} selected={sourcingSelected} setSelected={setSourcingSelected} />
        ) : (
          <CandidateTable rows={filtered} onOpen={setSelectedId} highlightedId={highlightedId} onHighlight={setHighlightedId} />
        )}
      </div>

      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-widest text-cream-300 font-medium tabular-nums shrink-0 bg-brown-950">
        <span>showing {filtered.length} of {view === 'sourcing' ? `${funnelCounts.sourced} pool` : rows.length}</span>
        <span className="text-cream-300 normal-case tracking-normal font-normal">
          <Kbd>/</Kbd> search · <Kbd>j</Kbd>/<Kbd>k</Kbd> nav · <Kbd>Enter</Kbd> open · <Kbd>n</Kbd> new · <Kbd>v</Kbd> view · <button type="button" onClick={() => setShowHelp(true)} className="cursor-pointer hover:text-cream-50 transition-colors duration-150"><Kbd>?</Kbd> help</button> · <Kbd>Esc</Kbd> close
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
      {showHelp ? <HelpModal onClose={() => setShowHelp(false)} /> : null}
    </div>
  );
}

/**
 * "Resync attend" header button + status sub-line. Shows the latest sync's
 * scanned/updated/bumped counts, falls back to the cron's most recent
 * attendCachedAt across all rows when we haven't run a manual sync this
 * session. Errors render inline next to the button with a dismiss control.
 */
function SyncAllButton({
  state, error, lastResult, lastRunAt, onRun, onDismissError,
}: Readonly<{
  state: 'idle' | 'running' | 'error';
  error: string | null;
  lastResult: { scanned: number; updated: number; bumped: number; created: number; errors: number } | null;
  lastRunAt: string | null;
  onRun: () => void;
  onDismissError: () => void;
}>) {
  const running = state === 'running';
  return (
    <div className="flex items-center gap-2">
      {error ? (
        <div className="flex items-center gap-1 text-xs text-red-400">
          <span className="max-w-[18rem] truncate" title={error}>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss error"
            className="text-cream-300 hover:text-cream-50 cursor-pointer px-1"
          >×</button>
        </div>
      ) : lastResult ? (
        <span className="text-xs text-cream-300 tabular-nums" aria-live="polite">
          Last sync: {lastRunAt ? relativeTime(lastRunAt) : '—'}
          {lastResult.created > 0 ? <> · <span className="text-green-400">{lastResult.created} created</span></> : null}
          {' · '}{lastResult.updated} updated · {lastResult.bumped} bumped
          {lastResult.errors > 0 ? <span className="text-red-400"> · {lastResult.errors} errors</span> : null}
        </span>
      ) : lastRunAt ? (
        <span className="text-xs text-cream-300 tabular-nums">
          Last sync: {relativeTime(lastRunAt)}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRun}
        disabled={running}
        className="text-xs uppercase tracking-widest font-medium px-3 py-2 bg-brown-800 text-cream-200 hover:text-cream-50 disabled:opacity-40 cursor-pointer transition-[color,background-color] duration-150 active:scale-[0.97]"
      >{running ? 'Syncing…' : 'Resync attend'}</button>
    </div>
  );
}

/**
 * Adds confirmed-yes + booked-flight candidates into the attendees Slack
 * channel. Additive only — never removes existing members.
 */
function SlackSyncButton({
  state, error, lastResult, lastRunAt, onRun, onDismissError,
}: Readonly<{
  state: 'idle' | 'running' | 'error';
  error: string | null;
  lastResult: { invited: number; alreadyIn: number; skippedNoSlackId: number; failed: number } | null;
  lastRunAt: string | null;
  onRun: () => void;
  onDismissError: () => void;
}>) {
  const running = state === 'running';
  return (
    <div className="flex items-center gap-2">
      {error ? (
        <div className="flex items-center gap-1 text-xs text-red-400">
          <span className="max-w-[18rem] truncate" title={error}>{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss error"
            className="text-cream-300 hover:text-cream-50 cursor-pointer px-1"
          >×</button>
        </div>
      ) : lastResult ? (
        <span className="text-xs text-cream-300 tabular-nums" aria-live="polite">
          Slack: {lastRunAt ? relativeTime(lastRunAt) : '—'}
          {' · '}<span className="text-green-400">{lastResult.invited} added</span>
          {' · '}{lastResult.alreadyIn} already in
          {lastResult.skippedNoSlackId > 0 ? <> · {lastResult.skippedNoSlackId} no slack</> : null}
          {lastResult.failed > 0 ? <span className="text-red-400"> · {lastResult.failed} failed</span> : null}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRun}
        disabled={running}
        title="Add CONFIRMED_YES + BOOKED_FLIGHT candidates to the attendees Slack channel (additive only)"
        className="text-xs uppercase tracking-widest font-medium px-3 py-2 bg-brown-800 text-cream-200 hover:text-cream-50 disabled:opacity-40 cursor-pointer transition-[color,background-color] duration-150 active:scale-[0.97]"
      >{running ? 'Inviting…' : 'Sync slack'}</button>
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
 * Per-stage funnel chip. Bare counts only — no per-stage percentages, since
 * the 40% girl target applies to the *whole event*, not each stage.
 */
function FunnelChip({
  label, total, girls, accent, tone,
}: Readonly<{ label: string; total: number; girls: number; accent: string; tone: string }>) {
  const active = total > 0;
  return (
    <div className={`flex-1 min-w-[140px] flex items-stretch gap-2.5 ${active ? 'bg-brown-800' : 'bg-brown-800/40'}`}>
      <span className={`block w-1.5 shrink-0 ${active ? accent : 'bg-brown-900'}`} aria-hidden />
      <div className="flex-1 min-w-0 py-2 pr-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs uppercase tracking-widest text-cream-200 font-medium truncate">{label}</span>
          <span className={`text-base font-semibold tabular-nums leading-none ${active ? tone : 'text-cream-400'}`}>{total}</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-end">
          <span
            className={`text-xs tabular-nums font-medium ${active && girls > 0 ? 'text-pink-300' : 'text-cream-400'}`}
            title={active ? `${girls} girl${girls === 1 ? '' : 's'} in this stage` : 'no candidates'}
          >
            ♀ {active ? girls : 0}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Hero readout for the girl target — compact two-line layout that matches
 * the per-stage funnel chip height. */
function GirlTargetChip({ confirmedGirls, girlTarget }: Readonly<{ confirmedGirls: number; girlTarget: number }>) {
  const pctOfTarget = girlTarget > 0 ? Math.min(100, Math.round((confirmedGirls / girlTarget) * 100)) : 0;
  const cls = girlPctClass(pctOfTarget);
  return (
    <div className="bg-brown-800 px-3 py-2 flex flex-col justify-between min-w-[180px]">
      <div className="text-xs uppercase tracking-widest text-cream-300 font-medium">Girls confirmed</div>
      <div className="flex items-baseline justify-between gap-2 mt-1.5">
        <span className="text-base font-semibold tabular-nums leading-none">
          <span className={cls}>{confirmedGirls}</span>
          <span className="text-cream-400 font-medium mx-1.5">/</span>
          <span className="text-cream-400 font-medium">{girlTarget}</span>
          <span className="mx-2 text-cream-400/60 font-normal">·</span>
          <span className={cls}>{pctOfTarget}%</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Hero readout for the total approved stipend in Airtable. The whole card is a
 * link to the Need Based Stipends view; a small "!" indicator appears when one
 * or more approved stipends in Airtable can't be matched to a candidate row by
 * email or slack id (so the team knows there's drift to reconcile).
 */
function StipendChip({ summary }: Readonly<{
  summary: { totalApprovedCents: number; unmatchedCount: number; airtableUrl: string } | null;
}>) {
  const dollars = summary ? Math.round(summary.totalApprovedCents / 100) : null;
  const unmatched = summary?.unmatchedCount ?? 0;
  const href = summary?.airtableUrl ?? 'https://airtable.com/appRMw1ya4lnaYsGv/tblrekVLXlHMNWH53/viwBFr8SRusYLWCxW';
  const title = unmatched > 0
    ? `${unmatched} approved stipend${unmatched === 1 ? '' : 's'} in Airtable not matched to a candidate by email/slack — open Airtable to reconcile`
    : 'Open the Need Based Stipends view in Airtable';
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="bg-brown-800 px-3 py-2 flex flex-col justify-between min-w-[150px] hover:bg-brown-700 transition-[background-color] duration-150 cursor-pointer"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-widest text-cream-300 font-medium">Total stipend</span>
        {unmatched > 0 ? (
          <span
            aria-label={`${unmatched} unmatched`}
            className="inline-flex items-center justify-center min-w-[1rem] h-4 px-1 bg-red-500/20 text-red-300 text-[10px] font-bold tabular-nums leading-none"
          >!{unmatched > 1 ? <span className="ml-0.5">{unmatched}</span> : null}</span>
        ) : null}
      </div>
      <div className="text-base font-semibold tabular-nums leading-none text-orange-400 mt-1.5">
        {dollars == null ? '—' : `$${dollars.toLocaleString()}`}
      </div>
    </a>
  );
}

function girlPctClass(pct: number): string {
  if (pct >= 40) return 'text-pink-300';
  if (pct >= 30) return 'text-yellow-300';
  return 'text-red-400';
}

function Kbd({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-px bg-brown-800 text-cream-200 text-xs tabular-nums">
      {children}
    </kbd>
  );
}
