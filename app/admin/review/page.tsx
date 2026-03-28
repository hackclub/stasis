'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getTierById } from '@/lib/tiers';
import { projects as starterProjects } from '@/app/starter-projects/projects';

interface ReviewAuthor {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface QueueItem {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  category: string;
  tier: number | null;
  author: ReviewAuthor;
  workUnits: number;
  entryCount: number;
  bomCost: number;
  costPerUnit: number;
  bitsPerHour: number | null;
  waitingMs: number;
  createdAt: string;
  preReviewed: boolean;
  claimedByOther: boolean;
  claimedBySelf: boolean;
  claimerName: string | null;
  reviewCount: number;
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isAdmin: boolean;
}

interface ReviewerStat {
  reviewer: { id: string; name: string | null; image: string | null };
  count: number;
}

interface Stats {
  pendingCount: number;
  totalPendingWorkUnits: number;
  topReviewersWeekly: ReviewerStat[];
  topReviewersAllTime: ReviewerStat[];
  guideCounts: Record<string, number>;
}

function formatWaitTime(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

const TIER_COLORS: Record<number, string> = {
  1: 'bg-cream-500/20 text-cream-100',
  2: 'bg-green-500/20 text-green-400',
  3: 'bg-blue-500/20 text-blue-400',
  4: 'bg-purple-500/20 text-purple-400',
  5: 'bg-orange-500/20 text-orange-400',
};

export default function ReviewQueuePage() {
  const router = useRouter();
  const [data, setData] = useState<QueueResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statsTab, setStatsTab] = useState<'weekly' | 'allTime'>('weekly');
  const [navigating, setNavigating] = useState(false);

  // Navigate into the review flow with a filter applied
  async function startFilteredReview(filterCategory: string, filterGuide: string, filterNameSearch?: string, filterSort?: string) {
    setNavigating(true);
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterGuide) params.set('guide', filterGuide);
      if (filterNameSearch) params.set('nameSearch', filterNameSearch);
      if (filterSort) params.set('sort', filterSort);
      params.set('limit', '1');
      const res = await fetch(`/api/reviews?${params}`);
      if (res.ok) {
        const { items } = await res.json();
        if (items.length > 0) {
          const qp = new URLSearchParams();
          if (filterCategory) qp.set('category', filterCategory);
          if (filterGuide) qp.set('guide', filterGuide);
          if (filterNameSearch) qp.set('nameSearch', filterNameSearch);
          if (filterSort) qp.set('sort', filterSort);
          router.push(`/admin/review/${items[0].id}?${qp}`);
          return;
        }
      }
      alert('No submissions match that filter.');
    } catch {
      alert('Failed to load review queue.');
    } finally {
      setNavigating(false);
    }
  }

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('limit', '500');
      const res = await fetch(`/api/reviews?${params}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to fetch queue:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/reviews/stats');
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
     };

  return (
    <>
      {/* Stats Header */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pending Count */}
        <div className="bg-brown-800 border border-cream-500/20 rounded p-4">
          <p className="text-cream-200 text-xs uppercase tracking-wider mb-1">Pending Submissions</p>
          <p className="text-orange-500 text-2xl font-bold">{stats?.pendingCount ?? '...'}</p>
          <p className="text-cream-200 text-xs mt-1">
            {stats ? `${stats.totalPendingWorkUnits}h total work units` : ''}
          </p>
        </div>

        {/* Top Reviewers (tabbed) */}
        <div className="bg-brown-800 border border-cream-500/20 rounded p-4 md:col-span-2">
          <div className="flex items-center gap-4 mb-2">
            <p className="text-cream-200 text-xs uppercase tracking-wider">Top Reviewers</p>
            <div className="flex gap-1">
              <button
                onClick={() => setStatsTab('weekly')}
                className={`px-2 py-0.5 text-xs uppercase cursor-pointer ${
                  statsTab === 'weekly'
                    ? 'bg-orange-500 text-white'
                    : 'bg-brown-900 text-cream-100 hover:bg-cream-500/10'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setStatsTab('allTime')}
                className={`px-2 py-0.5 text-xs uppercase cursor-pointer ${
                  statsTab === 'allTime'
                    ? 'bg-orange-500 text-white'
                    : 'bg-brown-900 text-cream-100 hover:bg-cream-500/10'
                }`}
              >
                All Time
              </button>
            </div>
          </div>
          <div className="flex gap-4 flex-wrap">
            {(statsTab === 'weekly' ? stats?.topReviewersWeekly : stats?.topReviewersAllTime)?.map(
              (s, i) => (
                <div key={s.reviewer.id} className="flex items-center gap-2">
                  <span className="text-cream-200 text-xs">{i + 1}.</span>
                  {s.reviewer.image && (
                    <img src={s.reviewer.image} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <span className="text-cream-50 text-sm">{s.reviewer.name || 'Unknown'}</span>
                  <span className="text-orange-500 text-sm font-bold">{s.count}</span>
                </div>
              )
            ) || <span className="text-cream-200 text-sm">No reviews yet</span>}
          </div>
        </div>
      </div>

      {/* Legend */}
      {data?.isAdmin && (
        <div className="mb-4 flex gap-4 text-xs text-cream-200">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-orange-500/20 border border-orange-500/40 inline-block" />
            Pre-reviewed (awaiting admin)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-cream-500/10 opacity-50 border border-cream-500/20 inline-block" />
            Claimed by another reviewer
          </span>
        </div>
      )}

      {/* Toolbar — each filter button starts reviewing with that filter */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-cream-200 uppercase tracking-wider mr-1">Review:</span>
          <button
            onClick={() => startFilteredReview('', '', '', '')}
            disabled={navigating}
            className="px-4 py-1.5 text-xs uppercase tracking-wider border border-orange-500 bg-orange-500 text-white hover:bg-orange-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {navigating ? 'Loading...' : 'All'}
          </button>
          <button
            onClick={() => startFilteredReview('DESIGN', '', '', '')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Design
          </button>
          <button
            onClick={() => startFilteredReview('BUILD', '', '', '')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Build
          </button>

          <span className="border-l border-cream-500/30 mx-1 hidden sm:inline-block" />

          {starterProjects.map((sp) => (
            <button
              key={sp.id}
              onClick={() => startFilteredReview('', sp.id, '', '')}
              disabled={navigating}
              className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sp.name}
              {stats?.guideCounts[sp.id] ? ` (${stats.guideCounts[sp.id]})` : ''}
            </button>
          ))}
          <button
            onClick={() => startFilteredReview('', 'custom', '', '')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Custom
            {stats?.guideCounts['custom'] ? ` (${stats.guideCounts['custom']})` : ''}
          </button>

          <span className="border-l border-cream-500/30 mx-1 hidden sm:inline-block" />

          <button
            onClick={() => startFilteredReview('', '', 'devboard', '')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Devboard (name)
          </button>
          <button
            onClick={() => startFilteredReview('', '', 'keyboard', '')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Keyboard (name)
          </button>
          <button
            onClick={() => startFilteredReview('', '', '', 'most_hours')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Most Hours
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by ID, title, or author..."
            className="px-3 py-1.5 text-sm border border-cream-500/30 bg-brown-800 text-cream-50 placeholder:text-cream-500 focus:outline-none focus:border-orange-500 w-full sm:w-64"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-orange-500 text-orange-500 hover:bg-orange-500/10 cursor-pointer"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput('');}}
              className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Queue Table */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-cream-200">Loading queue...</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="bg-brown-800 border border-cream-500/20 rounded p-8 text-center">
          <p className="text-cream-200">No submissions in queue</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-brown-800 border border-cream-500/20 rounded">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-cream-500/20">
                  <th className="text-left text-xs uppercase tracking-wider text-cream-200 px-3 py-2">Title</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden lg:table-cell">Author</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-200 px-3 py-2">Category</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden md:table-cell">Tier</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden md:table-cell">BOM</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden md:table-cell">$/h</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden md:table-cell">bits/h</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2">Work Units</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden lg:table-cell">Entries</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2">Waiting</th>
                  <th className="text-center text-xs uppercase tracking-wider text-cream-200 px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const tierInfo = item.tier ? getTierById(item.tier) : null;
                  const rowClass = item.claimedByOther
                    ? 'opacity-50'
                    : item.preReviewed
                      ? 'bg-orange-500/10'
                      : '';

                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-cream-500/10 hover:bg-cream-500/5 transition-colors ${rowClass}`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {item.coverImage && (
                            <img
                              src={item.coverImage}
                              alt=""
                              className="w-8 h-8 object-cover border border-cream-500/20 flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate max-w-[200px] ${
                              item.preReviewed && data.isAdmin ? 'text-orange-400' : 'text-cream-50'
                            }`}>
                              {item.title}
                            </p>
                            {item.preReviewed && data.isAdmin && (
                              <span className="text-xs text-orange-500 uppercase">Pre-reviewed</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          {item.author.image && (
                            <img src={item.author.image} alt="" className="w-5 h-5 rounded-full" />
                          )}
                          <span className="text-sm text-cream-100 truncate max-w-[120px]">
                            {item.author.name || item.author.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs uppercase px-2 py-0.5 ${
                          item.category === 'DESIGN'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {item.category}
                        </span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {tierInfo && (
                          <span className={`text-xs px-2 py-0.5 ${TIER_COLORS[item.tier!] || ''}`}>
                            {tierInfo.name} ({tierInfo.bits}b)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-cream-100 hidden md:table-cell">
                        ${item.bomCost.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-cream-100 hidden md:table-cell">
                        {item.costPerUnit > 0 ? `$${item.costPerUnit.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-orange-400 hidden md:table-cell">
                        {item.bitsPerHour !== null ? item.bitsPerHour : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-cream-100">
                        {item.workUnits}h
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-cream-100 hidden lg:table-cell">
                        {item.entryCount}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-cream-100">
                        {formatWaitTime(item.waitingMs)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div>
                          <Link
                            href={`/admin/review/${item.id}`}
                            className={`inline-block px-3 py-1 text-xs uppercase tracking-wider border transition-colors ${
                              item.claimedByOther
                                ? 'border-cream-500/20 text-cream-500 cursor-not-allowed'
                                : 'border-orange-500 text-orange-500 hover:bg-orange-500/10'
                            }`}
                          >
                            Review
                          </Link>
                          {item.claimedByOther && (
                            <p className="text-xs text-cream-500 mt-1">Claimed</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </>
      )}
    </>
  );
}
