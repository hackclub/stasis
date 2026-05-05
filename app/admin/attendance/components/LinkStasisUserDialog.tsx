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

interface LinkTarget {
  candidateId: string;
  candidateName: string | null;
  candidateEmail: string | null;
  candidateImage: string | null;
}

/**
 * Searches Stasis users by email/name/slack and links the existing external
 * candidate to the chosen user. Mirrors the user-search half of
 * AddCandidateDialog, but PATCH-style: it links rather than creates.
 *
 * Prefilled with the candidate's external email/name to make the common case
 * (admin already knows the Stasis email) one click.
 */
export function LinkStasisUserDialog({
  target, onClose, onLinked,
}: Readonly<{ target: LinkTarget; onClose: () => void; onLinked: () => void }>) {
  const seed = (target.candidateEmail || target.candidateName || '').trim();
  const [q, setQ] = useState(seed);
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  // Debounced search against the same lookup endpoint Add Candidate uses.
  useEffect(() => {
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
  }, [q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !submitting) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const link = useCallback(async (userId: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/attendance/${target.candidateId}/link-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Link failed');
      onLinked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }, [target.candidateId, onLinked, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] font-sans" onClick={() => { if (!submitting) onClose(); }}>
      <div className="attendance-modal-backdrop absolute inset-0 bg-black/60" />
      <div
        className="attendance-modal-drawer relative w-full max-w-lg bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-brown-800 px-4 py-3">
          <h3 className="text-orange-500 text-xs uppercase tracking-widest font-medium">Link to Stasis user</h3>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="shrink-0 text-cream-300 hover:text-cream-50 hover:bg-black/20 disabled:opacity-40 disabled:cursor-not-allowed transition-[color,background-color] duration-150 text-2xl leading-none cursor-pointer w-8 h-8 inline-flex items-center justify-center"
          >×</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3 bg-brown-800/60 px-3 py-2">
            <Avatar name={target.candidateName} email={target.candidateEmail} image={target.candidateImage} size={32} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-cream-50 font-medium truncate">{target.candidateName ?? '—'}</div>
              <div className="text-xs text-cream-300 truncate">{target.candidateEmail ?? <span className="italic text-cream-400">no email on file</span>}</div>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-cream-400 font-medium shrink-0">external</span>
          </div>

          <div className="text-xs text-cream-300 leading-relaxed">
            Find their <span className="text-cream-100">Stasis account</span> by its email, name, or Slack ID.
            Once linked, the Stasis user record becomes the source of truth and the
            external fields above will be cleared.
          </div>

          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Stasis email, name, or Slack ID…"
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
            ) : matches.map((m) => {
              const blocked = !!m.existingCandidateId;
              return (
                <button
                  key={m.id}
                  onClick={() => !blocked && link(m.id)}
                  disabled={blocked || submitting}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left bg-brown-800 hover:bg-orange-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Avatar name={m.name} email={m.email} image={m.image} size={32} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-cream-50 font-medium truncate">{m.name ?? m.email}</div>
                    <div className="text-xs text-cream-300 truncate tabular-nums">
                      {m.email}{m.slackId ? <><span className="mx-2 text-cream-400/60">·</span>{m.slackId}</> : null}
                    </div>
                  </div>
                  {blocked ? (
                    <span className="text-xs uppercase tracking-widest font-medium text-cream-300">already a candidate</span>
                  ) : (
                    <span className="text-xs uppercase tracking-widest font-medium text-orange-400">link →</span>
                  )}
                </button>
              );
            })}
          </div>

          {error ? <div className="text-xs text-red-300 bg-red-500/15 px-3 py-2">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
