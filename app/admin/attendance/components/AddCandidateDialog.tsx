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
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-lg bg-brown-900 border border-brown-700 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-brown-700">
          <h3 className="text-orange-500 text-xs uppercase tracking-widest">Add candidate</h3>
          <button onClick={onClose} className="text-cream-300 hover:text-cream-50 text-2xl leading-none cursor-pointer">×</button>
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
                className="w-full bg-brown-800 border border-brown-700 text-cream-50 text-sm px-3 py-2 focus:outline-none focus:border-orange-500"
              />
              <div className="min-h-[120px] max-h-[40vh] overflow-y-auto border border-brown-700 divide-y divide-brown-700">
                {searching ? (
                  <div className="p-3 text-xs text-cream-400">Searching…</div>
                ) : matches.length === 0 && q.trim().length >= 2 ? (
                  <div className="p-3 text-xs text-cream-400 italic">No matches.</div>
                ) : matches.length === 0 ? (
                  <div className="p-3 text-xs text-cream-400 italic">Type at least 2 characters.</div>
                ) : matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => !m.existingCandidateId && addUser(m.id)}
                    disabled={!!m.existingCandidateId || submitting}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-brown-800/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Avatar name={m.name} email={m.email} image={m.image} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-cream-50 truncate">{m.name ?? m.email}</div>
                      <div className="text-[10px] text-cream-400 truncate">{m.email}{m.slackId ? ` · ${m.slackId}` : ''}</div>
                    </div>
                    {m.existingCandidateId ? (
                      <span className="text-[10px] uppercase tracking-wider text-cream-400">already added</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider text-orange-400">+ add</span>
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
                  className="w-full bg-brown-800 border border-brown-700 text-cream-50 text-sm px-3 py-2 focus:outline-none focus:border-orange-500"
                />
                <input
                  value={external.email}
                  onChange={(e) => setExternal((v) => ({ ...v, email: e.target.value }))}
                  placeholder="Email (optional)"
                  className="w-full bg-brown-800 border border-brown-700 text-cream-50 text-sm px-3 py-2 focus:outline-none focus:border-orange-500"
                />
                <input
                  value={external.slackId}
                  onChange={(e) => setExternal((v) => ({ ...v, slackId: e.target.value }))}
                  placeholder="Slack ID (optional, e.g. U0A2SJ7B739)"
                  className="w-full bg-brown-800 border border-brown-700 text-cream-50 text-sm px-3 py-2 focus:outline-none focus:border-orange-500"
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
                  className="text-xs uppercase tracking-wider text-orange-400 hover:text-orange-300 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 border border-orange-500/40 cursor-pointer"
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
