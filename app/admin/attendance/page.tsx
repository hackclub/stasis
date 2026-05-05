'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { CandidateTable } from './components/CandidateTable';
import { CandidateKanban } from './components/CandidateKanban';
import { CandidateModal } from './components/CandidateModal';
import { AddCandidateDialog } from './components/AddCandidateDialog';
import { CandidateRow, AdminUser, KANBAN_ORDER, KANBAN_LABEL, kanbanColumnFor, kanbanColumnTone, kanbanColumnAccent } from './lib/types';

type ViewMode = 'table' | 'kanban';

interface FilterState {
  q: string;
  status: string;        // '' = all
  ownerId: string;       // '' = all, 'unassigned'
  showSnoozed: boolean;
  goal: string;          // '' = all, 'stasis', 'opensauce', 'prizes', 'null'
  pronouns: string;      // '' = all, 'he/him', 'she/her', 'they/them', 'other', 'none'
}

const DEFAULT_FILTERS: FilterState = {
  q: '',
  status: '',
  ownerId: '',
  showSnoozed: false,
  goal: '',
  pronouns: '',
};

function readFiltersFromUrl(sp: URLSearchParams): FilterState {
  return {
    q: sp.get('q') ?? '',
    status: sp.get('status') ?? '',
    ownerId: sp.get('owner') ?? '',
    showSnoozed: sp.get('snoozed') === '1',
    goal: sp.get('goal') ?? '',
    pronouns: sp.get('pronouns') ?? '',
  };
}

function readViewFromUrl(sp: URLSearchParams): ViewMode {
  return sp.get('view') === 'kanban' ? 'kanban' : 'table';
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

  // Mirror filters/view/id to URL (replace, no history spam)
  const initialMount = useRef(true);
  useEffect(() => {
    // Skip the initial mount push so we don't immediately rewrite the URL we just read from
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (filters.q) sp.set('q', filters.q);
      if (filters.status) sp.set('status', filters.status);
      if (filters.ownerId) sp.set('owner', filters.ownerId);
      if (filters.showSnoozed) sp.set('snoozed', '1');
      if (filters.goal) sp.set('goal', filters.goal);
      if (filters.pronouns) sp.set('pronouns', filters.pronouns);
      if (view !== 'table') sp.set('view', view);
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

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = [r.name, r.email, r.slackId, r.flakeNote, r.lastComms?.text]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.status && r.outreachStatus !== filters.status) return false;
      if (filters.ownerId === 'unassigned' && r.ownerId) return false;
      if (filters.ownerId && filters.ownerId !== 'unassigned' && r.ownerId !== filters.ownerId) return false;
      if (!filters.showSnoozed && r.snoozedUntil && new Date(r.snoozedUntil) > new Date()) return false;
      if (filters.goal === 'null' && r.eventPreference) return false;
      if (filters.goal && filters.goal !== 'null' && r.eventPreference !== filters.goal) return false;
      if (filters.pronouns === 'none' && r.pronouns) return false;
      if (filters.pronouns && filters.pronouns !== 'none' && r.pronouns !== filters.pronouns) return false;
      return true;
    });
  }, [rows, filters]);

  // Reset highlight when filtered set changes underneath it
  useEffect(() => {
    if (highlightedId && !filtered.some((r) => r.id === highlightedId)) {
      setHighlightedId(null);
    }
  }, [filtered, highlightedId]);

  const counts = useMemo(() => {
    const total = rows.length;
    const byCol = new Map<string, number>();
    for (const col of KANBAN_ORDER) byCol.set(col, 0);
    for (const r of rows) {
      const col = kanbanColumnFor(r);
      byCol.set(col, (byCol.get(col) ?? 0) + 1);
    }
    return { total, byCol };
  }, [rows]);

  // Keyboard shortcuts
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      // Always-active: Escape closes modal/dialog/clears selection
      if (e.key === 'Escape') {
        if (adding) { setAdding(false); return; }
        if (selectedId) { setSelectedId(null); return; }
        if (filters.q) { setFilters((f) => ({ ...f, q: '' })); return; }
        if (highlightedId) { setHighlightedId(null); return; }
      }

      // If a modal/dialog is open, swallow the rest (modal owns its own keys)
      if (selectedId || adding) return;

      // `/` focuses search even from inputs? Only when not already typing
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
        setView((v) => (v === 'table' ? 'kanban' : 'table'));
        return;
      }

      // Row navigation only meaningful in table view
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

  return (
    <div className="font-sans flex flex-col -mb-8 h-[calc(100dvh-9rem)]">
      <header className="mb-8 shrink-0">
        <div className="flex items-baseline gap-3 mb-1.5">
          <h1 className="text-cream-50 text-2xl font-medium">Attendance</h1>
          <span className="text-xs uppercase tracking-widest text-cream-300 font-medium tabular-nums">
            {counts.total} candidate{counts.total === 1 ? '' : 's'}
          </span>
        </div>
        <p className="text-cream-200 text-sm max-w-prose leading-relaxed">
          Curated list of every person we&apos;re working to land at the event. Click a row to open their full profile.
        </p>

        {/* Pipeline strip — instrumented readout of the kanban columns */}
        <div className="mt-6 flex overflow-x-auto gap-px bg-brown-900">
          {KANBAN_ORDER.map((col, i) => {
            const n = counts.byCol.get(col) ?? 0;
            const tone = kanbanColumnTone(col);
            const accent = kanbanColumnAccent(col);
            const active = n > 0;
            return (
              <div
                key={col}
                className={`flex-1 min-w-[120px] flex items-center justify-between gap-3 px-3 py-3 ${active ? 'bg-brown-800' : 'bg-brown-800/40'}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`block w-2 h-5 shrink-0 ${active ? accent : 'bg-brown-900'}`} aria-hidden />
                  <span className={`text-xs font-medium tabular-nums ${active ? tone : 'text-cream-400'}`}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-xs uppercase tracking-widest text-cream-200 font-medium truncate">
                    {KANBAN_LABEL[col]}
                  </span>
                </div>
                <span className={`text-base font-medium tabular-nums ${active ? tone : 'text-cream-400'}`}>{n}</span>
              </div>
            );
          })}
        </div>
      </header>

      {/* Toolbar — filter cluster | spacer | action cluster */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-6 shrink-0">
        <div className="relative w-72">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-cream-300 pointer-events-none">›</span>
          <input
            ref={searchRef}
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Search name, email, slack, notes…  ( / )"
            className="bg-brown-800 text-cream-50 text-xs pl-7 pr-2.5 py-2 outline-none focus:bg-brown-800 focus:ring-2 focus:ring-orange-500/60 focus:ring-inset w-full"
          />
        </div>
        <Select
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'IDENTIFIED', label: 'Identified' },
            { value: 'CONTACTED', label: 'Contacted' },
            { value: 'SOFT_YES', label: 'Soft yes' },
            { value: 'CONFIRMED_YES', label: 'Confirmed yes' },
            { value: 'DECLINED', label: 'Declined' },
          ]}
        />
        <Select
          value={filters.ownerId}
          onChange={(v) => setFilters((f) => ({ ...f, ownerId: v }))}
          options={[
            { value: '', label: 'Any owner' },
            { value: 'unassigned', label: 'Unassigned' },
            ...admins.map((a) => ({ value: a.id, label: `Owner: ${a.name?.split(' ')[0] ?? a.email}` })),
          ]}
        />
        <Select
          value={filters.goal}
          onChange={(v) => setFilters((f) => ({ ...f, goal: v }))}
          options={[
            { value: '', label: 'Any goal' },
            { value: 'stasis', label: 'Goal: Stasis' },
            { value: 'opensauce', label: 'Goal: Open Sauce' },
            { value: 'prizes', label: 'Goal: Prizes' },
            { value: 'null', label: 'Goal: not set' },
          ]}
        />
        <Select
          value={filters.pronouns}
          onChange={(v) => setFilters((f) => ({ ...f, pronouns: v }))}
          options={[
            { value: '', label: 'Any pronouns' },
            { value: 'she/her', label: 'she/her' },
            { value: 'he/him', label: 'he/him' },
            { value: 'they/them', label: 'they/them' },
            { value: 'none', label: 'no pronouns set' },
          ]}
        />
        <label className="text-xs uppercase tracking-widest text-cream-200 font-medium inline-flex items-center gap-1.5 cursor-pointer bg-brown-800 px-2.5 py-2">
          <input
            type="checkbox"
            checked={filters.showSnoozed}
            onChange={(e) => setFilters((f) => ({ ...f, showSnoozed: e.target.checked }))}
            className="accent-orange-500"
          />
          show snoozed
        </label>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-px bg-brown-900">
            <button
              onClick={() => setView('table')}
              className={`text-xs uppercase tracking-widest font-medium px-3 py-2 cursor-pointer ${view === 'table' ? 'bg-orange-500/20 text-orange-400' : 'bg-brown-800 text-cream-200 hover:text-cream-50'}`}
            >Table</button>
            <button
              onClick={() => setView('kanban')}
              className={`text-xs uppercase tracking-widest font-medium px-3 py-2 cursor-pointer ${view === 'kanban' ? 'bg-orange-500/20 text-orange-400' : 'bg-brown-800 text-cream-200 hover:text-cream-50'}`}
            >Kanban</button>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="text-xs uppercase tracking-widest font-medium px-3 py-2 bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 cursor-pointer"
          >+ Add candidate</button>
        </div>
      </div>

      {error ? <div className="text-red-400 text-sm mb-3 shrink-0">{error}</div> : null}

      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-col gap-px bg-brown-900 h-full overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-brown-800/60 animate-pulse shrink-0" />
            ))}
          </div>
        ) : view === 'table' ? (
          <CandidateTable rows={filtered} onOpen={setSelectedId} highlightedId={highlightedId} onHighlight={setHighlightedId} />
        ) : (
          <CandidateKanban rows={filtered} onOpen={setSelectedId} />
        )}
      </div>

      <div className="mt-3 pb-3 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-widest text-cream-300 font-medium tabular-nums shrink-0 bg-brown-900">
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

function Select({ value, onChange, options }: Readonly<{
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-brown-800 text-cream-50 text-xs px-2 py-2 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset cursor-pointer"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Kbd({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-px bg-brown-800 text-cream-200 text-xs tabular-nums">
      {children}
    </kbd>
  );
}
