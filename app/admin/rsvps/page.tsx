'use client';

import { useState, useEffect } from 'react';

interface TempRsvp {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  ip: string | null;
  utmSource: string | null;
  referredBy: string | null;
  finishedAccount: boolean;
  syncedToAirtable: boolean;
  createdAt: string;
}

export default function AdminRsvps() {
  const [rsvps, setRsvps] = useState<TempRsvp[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function fetchRsvps() {
    try {
      const res = await fetch('/api/admin/rsvps');
      if (res.ok) {
        setRsvps(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch RSVPs:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRsvps(); }, []);

  async function handleSyncToAirtable() {
    if (!confirm('Sync all temp RSVPs to Airtable? This will create entries for emails not already in Airtable.')) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/rsvps/sync-to-airtable', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        let msg = `Synced ${data.synced} RSVPs to Airtable.`;
        if (data.skipped > 0) {
          msg += `\n${data.skipped} failed:\n${data.errors.join('\n')}`;
        }
        alert(msg);
        fetchRsvps();
      }
    } catch (error) {
      console.error('Sync failed:', error);
      alert('Sync failed. Check console for details.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-cream-700 text-sm uppercase">
          {rsvps.length} temp rsvp{rsvps.length !== 1 ? 's' : ''} (not yet synced to airtable)
        </p>
        <button
          onClick={handleSyncToAirtable}
          disabled={rsvps.length === 0 || syncing}
          className="px-4 py-2 bg-brand-500 text-cream-100 text-sm uppercase tracking-wider hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {syncing ? 'Syncing...' : 'Sync to Airtable'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <p className="text-cream-700">Loading RSVPs...</p>
        </div>
      ) : rsvps.length === 0 ? (
        <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
          <p className="text-cream-700">No unsynced temp RSVPs</p>
        </div>
      ) : (
        <div className="bg-cream-100 border-2 border-cream-400 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-400 text-left text-cream-700 uppercase text-xs">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Referred By</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {rsvps.map((rsvp) => (
                <tr key={rsvp.id} className="border-b border-cream-300 last:border-0">
                  <td className="px-4 py-3 text-cream-800">{rsvp.email}</td>
                  <td className="px-4 py-3 text-cream-700">
                    {[rsvp.firstName, rsvp.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {rsvp.finishedAccount ? (
                      <span className="text-green-700">✓</span>
                    ) : (
                      <span className="text-cream-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-cream-600">{rsvp.utmSource || '—'}</td>
                  <td className="px-4 py-3 text-cream-600">{rsvp.referredBy || '—'}</td>
                  <td className="px-4 py-3 text-cream-600">
                    {new Date(rsvp.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
