'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  1: 'bg-gray-200 text-gray-800',
  2: 'bg-green-200 text-green-800',
  3: 'bg-blue-200 text-blue-800',
  4: 'bg-purple-200 text-purple-800',
  5: 'bg-orange-200 text-orange-800',
};

export default function ReviewQueuePage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [guide, setGuide] = useState('');
  const [page, setPage] = useState(1);
  const [statsTab, setStatsTab] = useState<'weekly' | 'allTime'>('weekly');

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (guide) params.set('guide', guide);
      params.set('page', page.toString());
      const res = await fetch(`/api/reviews?${params}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to fetch queue:', err);
    } finally {
      setLoading(false);
    }
  }, [search, category, guide, page]);

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
    setPage(1);
  };

  return (
    <>
      {/* Stats Header */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pending Count */}
        <div className="bg-cream-100 border-2 border-cream-400 p-4">
          <p className="text-brown-800 text-xs uppercase tracking-wider mb-1">Pending Submissions</p>
          <p className="text-orange-500 text-2xl font-bold">{stats?.pendingCount ?? '...'}</p>
          <p className="text-brown-800 text-xs mt-1">
            {stats ? `${stats.totalPendingWorkUnits}h total work units` : ''}
          </p>
        </div>

        {/* Top Reviewers (tabbed) */}
        <div className="bg-cream-100 border-2 border-cream-400 p-4 md:col-span-2">
          <div className="flex items-center gap-4 mb-2">
            <p className="text-brown-800 text-xs uppercase tracking-wider">Top Reviewers</p>
            <div className="flex gap-1">
              <button
                onClick={() => setStatsTab('weekly')}
                className={`px-2 py-0.5 text-xs uppercase cursor-pointer ${
                  statsTab === 'weekly'
                    ? 'bg-orange-500 text-white'
                    : 'bg-cream-200 text-brown-800 hover:bg-cream-300'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setStatsTab('allTime')}
                className={`px-2 py-0.5 text-xs uppercase cursor-pointer ${
                  statsTab === 'allTime'
                    ? 'bg-orange-500 text-white'
                    : 'bg-cream-200 text-brown-800 hover:bg-cream-300'
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
                  <span className="text-brown-800 text-xs">{i + 1}.</span>
                  {s.reviewer.image && (
                    <img src={s.reviewer.image} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <span className="text-brown-800 text-sm">{s.reviewer.name || 'Unknown'}</span>
                  <span className="text-orange-500 text-sm font-bold">{s.count}</span>
                </div>
              )
            ) || <span className="text-brown-800 text-sm">No reviews yet</span>}
          </div>
        </div>
      </div>

      {/* Legend */}
      {data?.isAdmin && (
        <div className="mb-4 flex gap-4 text-xs text-brown-800">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-orange-100 border border-orange-300 inline-block" />
            Pre-reviewed (awaiting admin)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-cream-200 opacity-50 border border-cream-400 inline-block" />
            Claimed by another reviewer
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setCategory(''); setPage(1); }}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
              category === ''
                ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                : 'border-cream-400 text-brown-800 hover:border-orange-500'
            }`}
          >
            All
          </button>
          <button
            onClick={() => { setCategory('DESIGN'); setPage(1); }}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
              category === 'DESIGN'
                ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                : 'border-cream-400 text-brown-800 hover:border-orange-500'
            }`}
          >
            Design
          </button>
          <button
            onClick={() => { setCategory('BUILD'); setPage(1); }}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
              category === 'BUILD'
                ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                : 'border-cream-400 text-brown-800 hover:border-orange-500'
            }`}
          >
            Build
          </button>

          <span className="border-l border-cream-400 mx-1" />

          {starterProjects.map((sp) => (
            <button
              key={sp.id}
              onClick={() => { setGuide(guide === sp.id ? '' : sp.id); setPage(1); }}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
                guide === sp.id
                  ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                  : 'border-cream-400 text-brown-800 hover:border-orange-500'
              }`}
            >
              {sp.name}
              {stats?.guideCounts[sp.id] ? ` (${stats.guideCounts[sp.id]})` : ''}
            </button>
          ))}
          <button
            onClick={() => { setGuide(guide === 'custom' ? '' : 'custom'); setPage(1); }}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
              guide === 'custom'
                ? 'border-orange-500 text-orange-500 bg-orange-500/10'
                : 'border-cream-400 text-brown-800 hover:border-orange-500'
            }`}
          >
            Custom
            {stats?.guideCounts['custom'] ? ` (${stats.guideCounts['custom']})` : ''}
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by ID, title, or author..."
            className="px-3 py-1.5 text-sm border border-cream-400 bg-cream-100 text-brown-800 placeholder:text-cream-600 focus:outline-none focus:border-orange-500 w-64"
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
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
              className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-400 text-brown-800 hover:border-orange-500 cursor-pointer"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Queue Table */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-brown-800">Loading queue...</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
          <p className="text-brown-800">No submissions in queue</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-cream-400">
                  <th className="text-left text-xs uppercase tracking-wider text-brown-800 px-3 py-2">Title</th>
                  <th className="text-left text-xs uppercase tracking-wider text-brown-800 px-3 py-2 hidden lg:table-cell">Author</th>
                  <th className="text-left text-xs uppercase tracking-wider text-brown-800 px-3 py-2">Category</th>
                  <th className="text-left text-xs uppercase tracking-wider text-brown-800 px-3 py-2 hidden md:table-cell">Tier</th>
                  <th className="text-right text-xs uppercase tracking-wider text-brown-800 px-3 py-2 hidden md:table-cell">BOM</th>
                  <th className="text-right text-xs uppercase tracking-wider text-brown-800 px-3 py-2 hidden md:table-cell">$/h</th>
                  <th className="text-right text-xs uppercase tracking-wider text-brown-800 px-3 py-2 hidden md:table-cell">bits/h</th>
                  <th className="text-right text-xs uppercase tracking-wider text-brown-800 px-3 py-2">Work Units</th>
                  <th className="text-right text-xs uppercase tracking-wider text-brown-800 px-3 py-2 hidden lg:table-cell">Entries</th>
                  <th className="text-right text-xs uppercase tracking-wider text-brown-800 px-3 py-2">Waiting</th>
                  <th className="text-center text-xs uppercase tracking-wider text-brown-800 px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const tierInfo = item.tier ? getTierById(item.tier) : null;
                  const rowClass = item.claimedByOther
                    ? 'opacity-50'
                    : item.preReviewed && data.isAdmin
                      ? 'bg-orange-50'
                      : '';

                  return (
                    <tr
                      key={item.id}
                      className={`border-b border-cream-300 hover:bg-cream-200/50 transition-colors ${rowClass}`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {item.coverImage && (
                            <img
                              src={item.coverImage}
                              alt=""
                              className="w-8 h-8 object-cover border border-cream-400 flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate max-w-[200px] ${
                              item.preReviewed && data.isAdmin ? 'text-orange-600' : 'text-brown-800'
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
                          <span className="text-sm text-brown-800 truncate max-w-[120px]">
                            {item.author.name || item.author.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs uppercase px-2 py-0.5 ${
                          item.category === 'DESIGN'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
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
                      <td className="px-3 py-3 text-right text-sm text-brown-800 hidden md:table-cell">
                        ${item.bomCost.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-brown-800 hidden md:table-cell">
                        {item.costPerUnit > 0 ? `$${item.costPerUnit.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-orange-500 hidden md:table-cell">
                        {item.bitsPerHour !== null ? item.bitsPerHour : '—'}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-brown-800">
                        {item.workUnits}h
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-brown-800 hidden lg:table-cell">
                        {item.entryCount}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-brown-800">
                        {formatWaitTime(item.waitingMs)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div>
                          <Link
                            href={`/admin/review/${item.id}`}
                            className={`inline-block px-3 py-1 text-xs uppercase tracking-wider border transition-colors ${
                              item.claimedByOther
                                ? 'border-cream-400 text-cream-600 cursor-not-allowed'
                                : 'border-orange-500 text-orange-500 hover:bg-orange-500/10'
                            }`}
                          >
                            Review
                          </Link>
                          {item.claimedByOther && (
                            <p className="text-xs text-cream-600 mt-1">Claimed</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs uppercase border border-cream-400 text-brown-800 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-sm text-brown-800">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="px-3 py-1.5 text-xs uppercase border border-cream-400 text-brown-800 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
