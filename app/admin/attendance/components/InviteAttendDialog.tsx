'use client';

import { useState, useEffect } from 'react';
import { Avatar } from './Avatar';

interface Props {
  candidateId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  alreadyInvited: boolean;
  onClose: () => void;
  onInvited: () => void;
}

/**
 * Confirms before sending an Attend invite. Shows the recipient (name + email)
 * prominently. On confirm, POSTs to the invite-attend endpoint which calls the
 * Attend API + sends the Loops branded invite email.
 */
export function InviteAttendDialog({
  candidateId, name, email, image, alreadyInvited, onClose, onInvited,
}: Readonly<Props>) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !sending) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  async function send() {
    if (!email) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/attendance/${candidateId}/invite-attend`, {
        method: 'POST',
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? 'Invite failed');
        if (j.detail) console.warn('[invite-attend]', j.detail);
        return;
      }
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center font-sans" onClick={() => { if (!sending) onClose(); }}>
      <div className="attendance-modal-backdrop absolute inset-0 bg-black/60" />
      <div
        className="attendance-modal-drawer relative bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-brown-800">
          <h3 className="text-orange-500 text-xs uppercase tracking-widest font-medium">Send Attend invite</h3>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={name} email={email} image={image} size={44} />
            <div className="min-w-0">
              <div className="text-cream-50 text-base font-medium truncate">{name ?? '—'}</div>
              <div className="text-cream-300 text-sm truncate">{email ?? <span className="text-red-400 italic">no email on file</span>}</div>
            </div>
          </div>

          {alreadyInvited ? (
            <div className="text-xs text-yellow-300 bg-yellow-500/10 px-3 py-2">
              This person is already marked as in Attend. Sending again is a no-op (Attend dedupes).
            </div>
          ) : null}

          <div className="text-sm text-cream-200 space-y-1.5">
            <div>Confirming will:</div>
            <ul className="text-xs text-cream-300 space-y-1 pl-4 list-disc marker:text-cream-400">
              <li>Register them on attend.hackclub.com for the Stasis event</li>
              <li>Send them the branded invite email</li>
              <li>Mark <span className="text-cream-100">In Attend</span> on this dashboard</li>
            </ul>
          </div>

          {error ? (
            <div className="text-xs text-red-300 bg-red-500/15 px-3 py-2">{error}</div>
          ) : null}
        </div>

        <div className="px-5 py-3 bg-brown-800/40 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={sending}
            className="text-xs uppercase tracking-widest font-medium text-cream-200 hover:text-cream-50 bg-brown-800 px-3 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >Cancel</button>
          <button
            onClick={send}
            disabled={sending || !email}
            className="text-xs uppercase tracking-widest font-medium text-orange-400 bg-orange-500/15 hover:bg-orange-500/30 px-3 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >{sending ? 'Sending…' : 'Send invite'}</button>
        </div>
      </div>
    </div>
  );
}
