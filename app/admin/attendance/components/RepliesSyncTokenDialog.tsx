'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

export type OwnerTokenMap = Record<string, { xoxc: string; xoxd: string }>;

/**
 * Modal that collects xoxc/xoxd tokens for the replies sync. The admin pastes
 * their `.env` block (lines like `SLACK_XOXC_REEM="xoxc-..."`) and we extract
 * `<name> -> { xoxc, xoxd }` pairs from it. Tokens are NEVER persisted —
 * they exist only for the lifetime of this dialog + the single sync call.
 */
export function RepliesSyncTokenDialog({
  onClose,
  onSubmit,
}: Readonly<{
  onClose: () => void;
  onSubmit: (tokens: OwnerTokenMap) => void;
}>) {
  const [pasted, setPasted] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parsed = useMemo(() => parsePastedEnv(pasted), [pasted]);
  const ownerNames = Object.keys(parsed).sort();

  const handleSubmit = () => {
    if (ownerNames.length === 0) return;
    onSubmit(parsed);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="attendance-modal-backdrop absolute inset-0 bg-black/60" />
      <div
        className="attendance-modal-drawer relative w-full max-w-xl bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-brown-800 px-4 py-3">
          <h3 className="text-orange-500 text-xs uppercase tracking-widest font-medium">Sync slack replies</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-cream-300 hover:text-cream-50 hover:bg-black/20 transition-[color,background-color] duration-150 text-2xl leading-none cursor-pointer w-8 h-8 inline-flex items-center justify-center"
          >×</button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-cream-300 leading-relaxed">
            Paste your slack token env vars below. Used only for this request.
          </p>

          <textarea
            ref={textareaRef}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'SLACK_XOXC_NAME="xoxc-..."\nSLACK_XOXD_NAME="xoxd-..."'}
            spellCheck={false}
            autoCorrect="off"
            autoComplete="off"
            className="w-full h-44 bg-brown-800 text-cream-50 text-xs px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/60 focus:ring-inset font-mono resize-none"
          />

          <div className="text-xs text-cream-300">
            {ownerNames.length === 0 ? (
              <span className="italic">No complete xoxc/xoxd pairs detected yet.</span>
            ) : (
              <>
                <span className="text-cream-50">Detected:</span>{' '}
                <span className="text-orange-400 tabular-nums">{ownerNames.join(', ')}</span>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="text-xs uppercase tracking-widest font-medium px-3 py-2 text-cream-300 hover:text-cream-50 hover:bg-black/20 cursor-pointer"
            >Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={ownerNames.length === 0}
              className="text-xs uppercase tracking-widest font-medium px-3 py-2 bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-[background-color] duration-150 active:scale-[0.97]"
            >Run sync</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pull `SLACK_(XOXC|XOXD)_<NAME>=value` pairs out of a free-text paste.
 * Returns only entries that have BOTH xoxc and xoxd for the same name.
 */
function parsePastedEnv(raw: string): OwnerTokenMap {
  const xoxc = new Map<string, string>();
  const xoxd = new Map<string, string>();
  // Tolerant of optional `export`, quotes (single/double), and trailing
  // comments. Tokens themselves never contain whitespace, so we stop at
  // the first whitespace/quote after the `=`.
  const re = /^\s*(?:export\s+)?SLACK_(XOXC|XOXD)_([A-Za-z0-9_]+)\s*=\s*["']?([^"'\s#]+)/i;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const kind = m[1].toUpperCase();
    const name = m[2].toLowerCase();
    const value = m[3];
    if (kind === 'XOXC') xoxc.set(name, value);
    else xoxd.set(name, value);
  }
  const out: OwnerTokenMap = {};
  for (const [name, c] of xoxc) {
    const d = xoxd.get(name);
    if (d) out[name] = { xoxc: c, xoxd: d };
  }
  return out;
}
