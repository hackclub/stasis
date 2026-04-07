'use client';

import { useState, useEffect, useCallback } from 'react';

interface LedgerEntry {
  id: string;
  userId: string;
  projectId: string | null;
  amount: number;
  type: 'PROJECT_APPROVED' | 'DESIGN_APPROVED' | 'ADMIN_GRANT' | 'ADMIN_DEDUCTION' | 'SHOP_PURCHASE';
  note: string | null;
  balanceBefore: number;
  balanceAfter: number;
  createdBy: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string };
}

const TYPE_LABELS: Record<LedgerEntry['type'], string> = {
  PROJECT_APPROVED: 'Project Approved',
  DESIGN_APPROVED: 'Design Approved (Pending)',
  ADMIN_GRANT: 'Admin Grant',
  ADMIN_DEDUCTION: 'Admin Deduction',
  SHOP_PURCHASE: 'Shop Purchase',
};

export default function BitsLedgerPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterUserId, setFilterUserId] = useState('');
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  // Manual adjustment form
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Resync pending bits
  const [resyncing, setResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(offset),
      });
      if (filterUserId.trim()) params.set('userId', filterUserId.trim());

      const res = await fetch(`/api/admin/currency?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setTotal(data.total);
      } else {
        setFetchError('Failed to load ledger entries.');
      }
    } catch {
      setFetchError('Network error — could not load ledger entries.');
    } finally {
      setLoading(false);
    }
  }, [offset, filterUserId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);
    const amount = parseInt(adjustAmount, 10);
    if (!adjustUserId.trim() || isNaN(amount) || amount === 0) {
      setAdjustError('User ID or email and a non-zero integer amount are required.');
      return;
    }

    setAdjusting(true);
    try {
      const res = await fetch('/api/admin/currency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: adjustUserId.trim(),
          amount,
          note: adjustNote.trim() || undefined,
        }),
      });

      if (res.ok) {
        setAdjustUserId('');
        setAdjustAmount('');
        setAdjustNote('');
        setOffset(0);
        fetchEntries();
      } else {
        const data = await res.json().catch(() => ({}));
        // Sanitize: only display a plain string message; truncate to prevent oversized text
        const msg = typeof data.error === 'string' ? data.error.slice(0, 200) : null;
        setAdjustError(msg ?? 'Failed to create adjustment.');
      }
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Bits Ledger</h1>
        <p className="text-cream-50 text-sm mt-1">
          Immutable record of all bits transactions. {total.toLocaleString()} total entries.
        </p>
      </div>

      {/* Manual adjustment */}
      <div className="bg-brown-800 border-2 border-cream-500/20 p-6">
        <h2 className="text-cream-50 text-lg uppercase tracking-wide mb-4">Manual Adjustment</h2>
        <form onSubmit={handleAdjust} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-cream-50 text-xs uppercase block mb-1">User ID or Email</label>
              <input
                type="text"
                value={adjustUserId}
                onChange={(e) => setAdjustUserId(e.target.value)}
                placeholder="cuid or email..."
                className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="text-cream-50 text-xs uppercase block mb-1">
                Amount (+ credit / − debit)
              </label>
              <input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 50 or -25"
                className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-cream-50 text-xs uppercase block mb-1">Note</label>
              <input
                type="text"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Reason..."
                className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
          {adjustError && <p className="text-red-600 text-sm">{adjustError}</p>}
          <button
            type="submit"
            disabled={adjusting}
            className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
          >
            {adjusting ? 'Saving...' : 'Create Adjustment'}
          </button>
        </form>
      </div>

      {/* Resync Pending Bits */}
      <div className="bg-brown-800 border-2 border-cream-500/20 p-6">
        <h2 className="text-cream-50 text-lg uppercase tracking-wide mb-2">Resync Pending Bits</h2>
        <p className="text-cream-200 text-sm mb-4">
          Backfills DESIGN_APPROVED entries for projects approved before the feature launched,
          then fixes orphaned pending bits on projects whose builds are already approved.
        </p>
        {resyncResult && <p className="text-cream-50 text-sm mb-3 whitespace-pre-line">{resyncResult}</p>}
        <button
          disabled={resyncing}
          onClick={async () => {
            setResyncing(true);
            setResyncResult(null);
            const messages: string[] = [];
            try {
              // Step 1: Backfill missing DESIGN_APPROVED entries
              const dryRes = await fetch('/api/admin/currency/backfill-pending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
              });
              const dryData = await dryRes.json();
              if (dryData.count > 0) {
                if (!confirm(`This will backfill pending bits for ${dryData.count} project(s) and fix orphaned entries. Continue?`)) {
                  setResyncResult('Cancelled.');
                  return;
                }
                const commitRes = await fetch('/api/admin/currency/backfill-pending', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ commit: true }),
                });
                const commitData = await commitRes.json();
                messages.push(`Backfilled ${commitData.backfilled} project(s).`);
              } else {
                messages.push('All projects already have pending bits entries.');
              }

              // Step 2: Fix orphaned pending bits on build-approved projects
              const fixDryRes = await fetch('/api/admin/currency/fix-pending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
              });
              const fixDryData = await fixDryRes.json();
              if (fixDryData.toFix > 0) {
                if (dryData.count === 0 && !confirm(`Found ${fixDryData.toFix} project(s) with orphaned pending bits (${fixDryData.totalBitsToReverse} bits total). Fix?`)) {
                  messages.push('Fix cancelled.');
                  setResyncResult(messages.join('\n'));
                  return;
                }
                const fixCommitRes = await fetch('/api/admin/currency/fix-pending', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ commit: true }),
                });
                const fixCommitData = await fixCommitRes.json();
                messages.push(`Fixed ${fixCommitData.fixed} project(s), reversed ${fixCommitData.totalBitsReversed} orphaned bits.`);
              } else {
                messages.push('No orphaned pending bits found.');
              }

              setResyncResult(messages.join('\n'));
              fetchEntries();
            } catch {
              setResyncResult('Network error — could not resync.');
            } finally {
              setResyncing(false);
            }
          }}
          className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
        >
          {resyncing ? 'Resyncing...' : 'Resync Pending Bits'}
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 items-end">
        <div>
          <label className="text-cream-50 text-xs uppercase block mb-1">Filter by User ID or Email</label>
          <input
            type="text"
            value={filterUserId}
            onChange={(e) => { setFilterUserId(e.target.value); setOffset(0); }}
            placeholder="Leave blank for all users"
            className="w-full sm:w-72 bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none font-mono"
          />
        </div>
      </div>

      {/* Ledger table */}
      <div className="bg-brown-800 border-2 border-cream-500/20 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center"><div className="loader" /></div>
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center">
            <p className="text-red-600 text-sm">{fetchError}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-cream-50">No ledger entries found.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-cream-500/20">
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Date</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">User</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Type</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Amount</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Balance After</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-cream-500/10 last:border-b-0 hover:bg-cream-500/5">
                  <td className="text-cream-50 px-4 py-3 whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-cream-50 font-medium">{entry.user.name ?? '—'}</p>
                    <p className="text-cream-200 text-xs">{entry.user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs uppercase border ${
                      entry.type === 'PROJECT_APPROVED'
                        ? 'bg-green-100 border-green-600 text-green-700'
                        : entry.type === 'DESIGN_APPROVED'
                        ? 'bg-gray-100 border-gray-500 text-gray-700'
                        : entry.type === 'ADMIN_GRANT'
                        ? 'bg-orange-500/10 border-orange-500/50 text-orange-500'
                        : entry.type === 'SHOP_PURCHASE'
                        ? 'bg-blue-100 border-blue-600 text-blue-700'
                        : 'bg-red-100 border-red-600 text-red-700'
                    }`}>
                      {TYPE_LABELS[entry.type]}
                    </span>
                  </td>
                  <td className={`text-right px-4 py-3 font-mono font-medium ${
                    entry.amount > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {entry.amount > 0 ? '+' : ''}{entry.amount}
                  </td>
                  <td className="text-right text-cream-50 px-4 py-3 font-mono">
                    {entry.balanceAfter}
                  </td>
                  <td className="text-cream-50 px-4 py-3 max-w-xs truncate">
                    {entry.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center gap-4">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="bg-brown-900 border border-cream-500/20 text-cream-50 px-4 py-2 text-sm uppercase disabled:opacity-40 hover:bg-cream-500/10 transition-colors cursor-pointer"
          >
            Previous
          </button>
          <span className="text-cream-50 text-sm">
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={offset + LIMIT >= total}
            className="bg-brown-900 border border-cream-500/20 text-cream-50 px-4 py-2 text-sm uppercase disabled:opacity-40 hover:bg-cream-500/10 transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
