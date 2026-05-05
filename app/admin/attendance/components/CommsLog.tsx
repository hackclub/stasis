'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar } from './Avatar';
import { relativeTime } from '../lib/types';

export interface CommsEntry {
  id: string;
  text: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string; image: string | null };
}

/**
 * Free-text ledger. The user types one line of plain prose ("dmed her about
 * parents, waiting for response"), hits Enter (Cmd+Enter for newline), and the
 * entry is appended with timestamp + author. AI tooling later post-processes
 * these to extract dates, follow-ups, sentiment.
 */
export function CommsLog({
  candidateId,
  entries,
  onAppend,
  onDelete,
}: Readonly<{
  candidateId: string;
  entries: CommsEntry[];
  onAppend: (entry: CommsEntry) => void;
  onDelete: (id: string) => void;
}>) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(async () => {
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
        throw new Error(j.error ?? 'Failed to append');
      }
      const j = await res.json();
      onAppend(j.entry);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
      // re-focus so you can keep typing
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [draft, submitting, candidateId, onAppend]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [draft]);

  return (
    <div className="space-y-3">
      <div className="bg-brown-800">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="What just happened? (e.g. dmed her about parents, waiting for response)"
          rows={1}
          className="w-full bg-transparent text-cream-50 placeholder:text-cream-400 px-3 py-2.5 text-sm resize-none focus:outline-none"
          disabled={submitting}
        />
        <div className="flex items-center justify-between bg-black/10 px-3 py-1.5">
          <span className="text-xs uppercase tracking-widest font-medium text-cream-300">
            Enter sends · Shift+Enter newline
          </span>
          <button
            onClick={submit}
            disabled={!draft.trim() || submitting}
            className="text-xs uppercase tracking-widest font-medium text-orange-400 hover:text-orange-300 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 cursor-pointer"
          >
            {submitting ? 'Logging…' : 'Log'}
          </button>
        </div>
        {error ? <div className="text-xs text-red-400 px-3 pb-2">{error}</div> : null}
      </div>

      <div className="space-y-2">
        {entries.length === 0 ? (
          <div className="text-xs text-cream-300 italic">No entries yet.</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex gap-3 bg-brown-800 px-3 py-2 group">
              <Avatar name={e.author.name} email={e.author.email} image={e.author.image} size={24} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-cream-50 font-medium">
                    {e.author.name ?? e.author.email}
                  </span>
                  <span className="text-xs uppercase tracking-widest font-medium text-cream-300 tabular-nums" title={new Date(e.createdAt).toLocaleString()}>
                    {relativeTime(e.createdAt)}
                  </span>
                  <button
                    onClick={() => setPendingDeleteId(e.id)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-300 ml-auto cursor-pointer px-2 py-1"
                    aria-label="Delete entry"
                  >
                    ×
                  </button>
                </div>
                <div className="text-sm text-cream-50 whitespace-pre-wrap break-words mt-0.5">{e.text}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {pendingDeleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPendingDeleteId(null)}>
          <div className="attendance-modal-backdrop absolute inset-0 bg-black/60" />
          <div className="attendance-modal-drawer relative bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-cream-50 text-sm font-medium mb-1">Delete entry?</div>
            <div className="text-cream-300 text-xs mb-4">This cannot be undone.</div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDeleteId(null)} className="text-xs uppercase tracking-widest font-medium text-cream-200 hover:text-cream-50 bg-brown-800 px-3 py-2 cursor-pointer">Cancel</button>
              <button onClick={async () => { const id = pendingDeleteId; setPendingDeleteId(null); const res = await fetch(`/api/admin/attendance/${candidateId}/comms?entryId=${id}`, { method: 'DELETE' }); if (res.ok) onDelete(id!); }} className="text-xs uppercase tracking-widest font-medium text-red-300 bg-red-500/20 hover:bg-red-500/30 px-3 py-2 cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
