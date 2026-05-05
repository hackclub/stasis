'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Avatar } from './Avatar';

interface UserMatch {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  slackId: string | null;
  existingCandidateId: string | null;
}

/**
 * Add candidate flow. Single search field that does double duty:
 *   - Type a substring → autocomplete Stasis users
 *   - Or click "Add as external" to create a non-user candidate manually
 */
export function AddCandidateDialog({
  onClose,
  onAdded,
}: Readonly<{ onClose: () => void; onAdded: (candidateId: string) => void }>) {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [externalMode, setExternalMode] = useState(false);
  const [external, setExternal] = useState({ name: '', email: '', slackId: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Debounced search
  useEffect(() => {
    if (externalMode) return;
    if (q.trim().length < 2) { setMatches([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/attendance/lookup?q=${encodeURIComponent(q)}`);
        const j = await res.json();
        setMatches(j.items ?? []);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, externalMode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addUser = useCallback(async (userId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      onAdded(j.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }, [onAdded]);

  async function addExternal() {
    if (!external.name.trim()) { setError('Name required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalName: external.name.trim(),
          externalEmail: external.email.trim() || undefined,
          externalSlackId: external.slackId.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      onAdded(j.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="attendance-modal-backdrop absolute inset-0 bg-black/60" />
      <div className="attendance-modal-drawer relative w-full max-w-lg bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-brown-800 px-4 py-3">
          <h3 className="text-orange-500 text-xs uppercase tracking-widest font-medium">Add candidate</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-cream-300 hover:text-cream-50 hover:bg-black/20 transition-[color,background-color] duration-150 text-2xl leading-none cursor-pointer w-8 h-8 inline-flex items-center justify-center">×</button>
        </div>

        <div className="p-4 space-y-3">
          {!externalMode ? (
            <>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by email, name, or Slack ID…"
                disabled={submitting}
                className="w-full bg-brown-800 text-cream-50 text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset"
              />
              <div className="min-h-[120px] max-h-[40vh] overflow-y-auto flex flex-col gap-px bg-brown-900">
                {searching ? (
                  <div className="p-3 bg-brown-800 text-xs text-cream-300">Searching…</div>
                ) : matches.length === 0 && q.trim().length >= 2 ? (
                  <div className="p-3 bg-brown-800 text-xs text-cream-300 italic">No matches.</div>
                ) : matches.length === 0 ? (
                  <div className="p-3 bg-brown-800 text-xs text-cream-300 italic">Type at least 2 characters.</div>
                ) : matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => !m.existingCandidateId && addUser(m.id)}
                    disabled={!!m.existingCandidateId || submitting}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left bg-brown-800 hover:bg-orange-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Avatar name={m.name} email={m.email} image={m.image} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-cream-50 font-medium truncate">{m.name ?? m.email}</div>
                      <div className="text-xs text-cream-300 truncate tabular-nums">
                        {m.email}{m.slackId ? <><span className="mx-2 text-cream-400/60">·</span>{m.slackId}</> : null}
                      </div>
                    </div>
                    {m.existingCandidateId ? (
                      <span className="text-xs uppercase tracking-widest font-medium text-cream-300">already added</span>
                    ) : (
                      <span className="text-xs uppercase tracking-widest font-medium text-orange-400">+ add</span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setExternalMode(true)}
                className="text-xs text-cream-300 hover:text-cream-50 cursor-pointer"
              >Not in Stasis? Add as external →</button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <input
                  ref={inputRef}
                  value={external.name}
                  onChange={(e) => setExternal((v) => ({ ...v, name: e.target.value }))}
                  placeholder="Name (required)"
                  className="w-full bg-brown-800 text-cream-50 text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset"
                />
                <input
                  value={external.email}
                  onChange={(e) => setExternal((v) => ({ ...v, email: e.target.value }))}
                  placeholder="Email (optional)"
                  className="w-full bg-brown-800 text-cream-50 text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset"
                />
                <input
                  value={external.slackId}
                  onChange={(e) => setExternal((v) => ({ ...v, slackId: e.target.value }))}
                  placeholder="Slack ID (optional, e.g. U0A2SJ7B739)"
                  className="w-full bg-brown-800 text-cream-50 text-sm px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset"
                />
              </div>
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setExternalMode(false)}
                  className="text-xs text-cream-300 hover:text-cream-50 cursor-pointer"
                >← Back to search</button>
                <button
                  onClick={addExternal}
                  disabled={submitting || !external.name.trim()}
                  className="text-xs uppercase tracking-widest font-medium text-orange-400 bg-orange-500/15 hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 cursor-pointer"
                >Add external</button>
              </div>
            </>
          )}
          {error ? <div className="text-xs text-red-400">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
