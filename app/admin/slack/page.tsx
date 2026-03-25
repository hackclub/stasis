'use client';

import { useState } from 'react';

interface InviteResult {
  slackId: string;
  name: string | null;
  ok: boolean;
  error?: string;
}

interface InviteResponse {
  total: number;
  invited: number;
  alreadyIn: number;
  failed: number;
  results: InviteResult[];
}

export default function AdminSlackPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InviteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleInviteGirls = async () => {
    if (!confirm('This will invite all users with she/her pronouns to the girls channel. Continue?')) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/slack/invite-girls', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to invite users');
        return;
      }

      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl text-brown-800 uppercase tracking-wide">Slack Jobs</h2>

      <div className="bg-cream-100 border border-cream-400 p-6 space-y-4">
        <div>
          <h3 className="text-lg text-brown-800 uppercase tracking-wide">Invite Girls to Channel</h3>
          <p className="text-brown-800/70 text-sm mt-1">
            Finds all users with she/her pronouns and invites them to{' '}
            <code className="bg-cream-200 px-1">#stasis-secret-spot</code> channel. Users already in the channel will be skipped.
          </p>
        </div>

        <button
          onClick={handleInviteGirls}
          disabled={loading}
          className="px-4 py-2 bg-orange-500 text-white uppercase tracking-wider text-sm hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? 'Inviting...' : 'Run Now'}
        </button>

        {error && (
          <div className="bg-red-100 border border-red-300 text-red-800 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div className="bg-cream-200 p-3 text-center">
                <div className="text-2xl text-brown-800 font-bold">{result.total}</div>
                <div className="text-brown-800/70 uppercase text-xs">Total Users</div>
              </div>
              <div className="bg-green-100 p-3 text-center">
                <div className="text-2xl text-green-800 font-bold">{result.invited}</div>
                <div className="text-green-800/70 uppercase text-xs">Invited</div>
              </div>
              <div className="bg-blue-100 p-3 text-center">
                <div className="text-2xl text-blue-800 font-bold">{result.alreadyIn}</div>
                <div className="text-blue-800/70 uppercase text-xs">Already In</div>
              </div>
              <div className="bg-red-100 p-3 text-center">
                <div className="text-2xl text-red-800 font-bold">{result.failed}</div>
                <div className="text-red-800/70 uppercase text-xs">Failed</div>
              </div>
            </div>

            {result.results.filter((r) => !r.ok).length > 0 && (
              <div className="text-sm">
                <h4 className="text-brown-800 uppercase tracking-wide text-xs mb-2">Failed Invites</h4>
                <div className="space-y-1">
                  {result.results
                    .filter((r) => !r.ok)
                    .map((r) => (
                      <div key={r.slackId} className="text-red-800 text-xs">
                        {r.name || r.slackId}: {r.error}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
