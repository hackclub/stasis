'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getTierById, TIERS } from '@/lib/tiers';
import { projects as starterProjects } from '@/app/starter-projects/projects';
import { useHotkeys, type HotkeyBinding } from '@/lib/hotkeys';
import HotkeyOverlay from '@/app/components/HotkeyOverlay';
import { useToast } from '@/app/components/Toast';
import { STATUS_LABEL, statusBg, type AttendanceStatus } from '@/app/admin/attendance/lib/types';

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
  totalWorkUnits: number;
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
  sheHerUS: boolean;
  attendingEvent?: boolean;
  attendanceStatus?: AttendanceStatus | null;
  region?: 'na' | 'eu' | 'other' | null;
}

interface QueueResponse {
  items: QueueItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  nextCursor: string | null;
  isAdmin: boolean;
}

interface ReviewerStat {
  reviewer: { id: string; name: string | null; image: string | null };
  count: number;
}

interface QueueStats {
  count: number;
  preReviewedCount: number;
  workUnits: number;
  waitP50Ms: number;
  waitP95Ms: number;
  waitMaxMs: number;
  waitMaxSubmissionId: string | null;
}

interface Stats {
  pendingCount: number;
  totalPendingWorkUnits: number;
  topReviewersDaily: ReviewerStat[];
  topReviewersWeekly: ReviewerStat[];
  topReviewersAllTime: ReviewerStat[];
  guideCounts: Record<string, number>;
  designQueue?: QueueStats;
  buildQueue?: QueueStats;
  isAdmin?: boolean;
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

type ReviewTab = 'DESIGN' | 'BUILD';

interface A1MiniEntry {
  reviewer: { id: string; name: string | null; image: string | null };
  weekCounts: number[];
  weeklyRafflePoints: number[];
  totalRafflePoints: number;
  totalReviews: number;
  totalBonusBits: number;
}

interface A1MiniResponse {
  weeks: string[];
  currentWeekIndex: number;
  entries: A1MiniEntry[];
}

type StatsTab = 'daily' | 'weekly' | 'allTime' | 'a1mini';

export default function ReviewQueuePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<ReviewTab>('DESIGN');
  const [designData, setDesignData] = useState<QueueResponse | null>(null);
  const [buildData, setBuildData] = useState<QueueResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statsTab, setStatsTab] = useState<StatsTab>('weekly');
  const [navigating, setNavigating] = useState(false);
  const [prioritizeAttending, setPrioritizeAttending] = useState(false);
  const [region, setRegion] = useState<'' | 'na' | 'eu'>('');
  const [selectedTiers, setSelectedTiers] = useState<number[]>([]);
  const [a1mini, setA1mini] = useState<A1MiniResponse | null>(null);
  const [a1miniLoading, setA1miniLoading] = useState(false);
  const [hotkeyOverlayOpen, setHotkeyOverlayOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [useOldReviewUi, setUseOldReviewUi] = useState(false);
  const [viewAsFirstPass, setViewAsFirstPass] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('reviewViewAsFirstPass') === '1';
    }
    return false;
  });
  const [guide, setGuide] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (viewAsFirstPass) {
      sessionStorage.setItem('reviewViewAsFirstPass', '1');
    } else {
      sessionStorage.removeItem('reviewViewAsFirstPass');
    }
  }, [viewAsFirstPass]);

  const data = activeTab === 'DESIGN' ? designData : buildData;

  // Navigate into the review flow with a filter applied. Persistent toolbar filters
  // (prioritize-attending, region) are folded in automatically.
  async function startFilteredReview(filterCategory: string, filterGuide: string, filterNameSearch?: string, filterSort?: string, filterPronouns?: string) {
    setNavigating(true);
    try {
      const params = new URLSearchParams();
      params.set('category', filterCategory || activeTab);
      if (filterGuide) params.set('guide', filterGuide);
      if (filterNameSearch) params.set('nameSearch', filterNameSearch);
      if (filterSort) params.set('sort', filterSort);
      if (filterPronouns) params.set('pronouns', filterPronouns);
      if (prioritizeAttending) params.set('prioritizeAttending', 'true');
      if (region) params.set('region', region);
      if (selectedTiers.length) params.set('tiers', selectedTiers.join(','));
      if (viewAsFirstPass) params.set('viewAs', 'first-pass');
      params.set('limit', '1');
      const res = await fetch(`/api/reviews?${params}`);
      if (res.ok) {
        const { items } = await res.json();
        if (items.length > 0) {
          const qp = new URLSearchParams();
          qp.set('category', filterCategory || activeTab);
          if (filterGuide) qp.set('guide', filterGuide);
          if (filterNameSearch) qp.set('nameSearch', filterNameSearch);
          if (filterSort) qp.set('sort', filterSort);
          if (filterPronouns) qp.set('pronouns', filterPronouns);
          if (prioritizeAttending) qp.set('prioritizeAttending', 'true');
          if (region) qp.set('region', region);
          if (selectedTiers.length) qp.set('tiers', selectedTiers.join(','));
          if (viewAsFirstPass) qp.set('viewAs', 'first-pass');
          router.push(`/admin/review/${items[0].id}${useOldReviewUi ? '/old' : ''}?${qp}`);
          return;
        }
      }
      showToast('No submissions match that filter', { variant: 'warn' });
    } catch {
      showToast('Failed to load review queue', { variant: 'error' });
    } finally {
      setNavigating(false);
    }
  }

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    try {
      const baseParams = new URLSearchParams();
      if (search) baseParams.set('search', search);
      if (guide) baseParams.set('guide', guide);
      if (prioritizeAttending) baseParams.set('prioritizeAttending', 'true');
      if (region) baseParams.set('region', region);
      if (selectedTiers.length) baseParams.set('tiers', selectedTiers.join(','));
      if (viewAsFirstPass) baseParams.set('viewAs', 'first-pass');
      baseParams.set('limit', '50');

      const designParams = new URLSearchParams(baseParams);
      designParams.set('category', 'DESIGN');
      const buildParams = new URLSearchParams(baseParams);
      buildParams.set('category', 'BUILD');

      const [designRes, buildRes] = await Promise.all([
        fetch(`/api/reviews?${designParams}`),
        fetch(`/api/reviews?${buildParams}`),
      ]);
      if (designRes.ok) setDesignData(await designRes.json());
      if (buildRes.ok) setBuildData(await buildRes.json());
    } catch (err) {
      console.error('Failed to fetch queues:', err);
    } finally {
      setLoading(false);
    }
  }, [search, guide, prioritizeAttending, region, selectedTiers, viewAsFirstPass]);

  const loadMore = useCallback(async (tab: ReviewTab) => {
    const current = tab === 'DESIGN' ? designData : buildData;
    if (!current?.nextCursor) return;
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (guide) params.set('guide', guide);
    if (prioritizeAttending) params.set('prioritizeAttending', 'true');
    if (region) params.set('region', region);
    if (selectedTiers.length) params.set('tiers', selectedTiers.join(','));
    if (viewAsFirstPass) params.set('viewAs', 'first-pass');
    params.set('limit', '50');
    params.set('category', tab);
    params.set('cursor', current.nextCursor);
    try {
      const res = await fetch(`/api/reviews?${params}`);
      if (!res.ok) return;
      const next: QueueResponse = await res.json();
      const seen = new Set(current.items.map((i) => i.id));
      const merged = [...current.items, ...next.items.filter((i) => !seen.has(i.id))];
      const updated = { ...next, items: merged };
      if (tab === 'DESIGN') setDesignData(updated);
      else setBuildData(updated);
    } catch (err) {
      console.error('Failed to load more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [designData, buildData, search, guide, prioritizeAttending, region, selectedTiers, viewAsFirstPass]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/reviews/stats');
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  const fetchA1Mini = useCallback(async () => {
    setA1miniLoading(true);
    try {
      const res = await fetch('/api/reviews/a1-mini');
      if (res.ok) setA1mini(await res.json());
    } catch (err) {
      console.error('Failed to fetch A1 Mini stats:', err);
    } finally {
      setA1miniLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueues(); }, [fetchQueues]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/reviewer-ui')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setUseOldReviewUi(!!d.useOld); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (statsTab === 'a1mini') fetchA1Mini();
  }, [statsTab, fetchA1Mini]);

  // Auto-load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!data?.nextCursor) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore(activeTab);
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [activeTab, data?.nextCursor, loadMore]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const designCount = designData?.total ?? 0;
  const buildCount = buildData?.total ?? 0;

  const hotkeys = useMemo<HotkeyBinding[]>(() => [
    {
      key: 'Shift+?',
      description: 'Show keyboard shortcuts',
      group: 'General',
      handler: () => setHotkeyOverlayOpen((v) => !v),
    },
    {
      key: '$mod+k',
      description: 'Focus search',
      group: 'Queue',
      runInInputs: true,
      handler: () => searchInputRef.current?.focus(),
    },
    {
      key: '[',
      description: 'Switch to Design tab',
      group: 'Queue',
      handler: () => setActiveTab('DESIGN'),
    },
    {
      key: ']',
      description: 'Switch to Build tab',
      group: 'Queue',
      handler: () => setActiveTab('BUILD'),
    },
  ], []);

  useHotkeys(hotkeys, hotkeyOverlayOpen);

  return (
    <>
      <HotkeyOverlay open={hotkeyOverlayOpen} bindings={hotkeys} onClose={() => setHotkeyOverlayOpen(false)} />
      {/* Stats Header */}
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Queue Depth + Wait Times */}
        <QueueStatsPanel
          designCount={designCount}
          buildCount={buildCount}
          designQueue={stats?.designQueue}
          buildQueue={stats?.buildQueue}
          isAdmin={stats?.isAdmin}
        />

        {/* Top Reviewers (tabbed) */}
        <div className="bg-brown-800 border border-cream-500/20 p-4">
          <div className="flex items-center gap-4 mb-2">
            <p className="text-cream-200 text-xs uppercase tracking-wider">Top Reviewers</p>
            <div className="flex gap-1">
              <button
                onClick={() => setStatsTab('daily')}
                className={`px-2 py-0.5 text-xs uppercase cursor-pointer ${
                  statsTab === 'daily'
                    ? 'bg-orange-500 text-white'
                    : 'bg-brown-900 text-cream-100 hover:bg-cream-500/10'
                }`}
              >
                24 Hours
              </button>
              <button
                onClick={() => setStatsTab('weekly')}
                className={`px-2 py-0.5 text-xs uppercase cursor-pointer ${
                  statsTab === 'weekly'
                    ? 'bg-orange-500 text-white'
                    : 'bg-brown-900 text-cream-100 hover:bg-cream-500/10'
                }`}
              >
                7 Days
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
              <button
                onClick={() => setStatsTab('a1mini')}
                className={`px-2 py-0.5 text-xs uppercase cursor-pointer ${
                  statsTab === 'a1mini'
                    ? 'bg-orange-500 text-white'
                    : 'bg-brown-900 text-cream-100 hover:bg-cream-500/10'
                }`}
              >
                A1 Mini
              </button>
            </div>
          </div>
          {statsTab === 'a1mini' ? (
            <A1MiniStats data={a1mini} loading={a1miniLoading} />
          ) : (
          <div className="flex gap-4 flex-wrap">
            {(statsTab === 'daily' ? stats?.topReviewersDaily : statsTab === 'weekly' ? stats?.topReviewersWeekly : stats?.topReviewersAllTime)?.map(
              (s, i) => (
                <div key={s.reviewer.id} className="flex items-center gap-2">
                  <span className="text-cream-200 text-xs">{i + 1}.</span>
                  {s.reviewer.image && (
                    <img src={s.reviewer.image} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <Link href={`/admin/users?search=${encodeURIComponent(s.reviewer.id)}`} className="text-cream-50 text-sm hover:text-orange-400 transition-colors">{s.reviewer.name || 'Unknown'}</Link>
                  <span className="text-orange-500 text-sm font-bold">{s.count}</span>
                </div>
              )
            ) || <span className="text-cream-200 text-sm">No reviews yet</span>}
          </div>
          )}
        </div>
      </div>

      {viewAsFirstPass && (
        <div className="mb-4 flex items-center justify-between px-4 py-2 border border-blue-500/40 bg-blue-500/10 text-blue-300 text-sm">
          <span className="uppercase tracking-wider text-xs font-medium">Acting as first-pass reviewer</span>
          <button
            onClick={() => setViewAsFirstPass(false)}
            className="px-3 py-1 text-xs uppercase tracking-wider border border-blue-400/50 hover:bg-blue-500/20 cursor-pointer"
          >
            Exit Preview
          </button>
        </div>
      )}

      {/* Design / Build Tabs */}
      <div className="mb-4 flex items-center gap-0 border-b border-cream-500/20">
        <button
          onClick={() => setActiveTab('DESIGN')}
          className={`px-6 py-2.5 text-sm uppercase tracking-wider font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
            activeTab === 'DESIGN'
              ? 'text-blue-400 border-blue-400'
              : 'text-cream-200 border-transparent hover:text-cream-50'
          }`}
        >
          Design Review
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
            activeTab === 'DESIGN' ? 'bg-blue-500/20' : 'bg-cream-500/10'
          }`}>{designCount}</span>
        </button>
        <button
          onClick={() => setActiveTab('BUILD')}
          className={`px-6 py-2.5 text-sm uppercase tracking-wider font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
            activeTab === 'BUILD'
              ? 'text-green-400 border-green-400'
              : 'text-cream-200 border-transparent hover:text-cream-50'
          }`}
        >
          Build Review
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
            activeTab === 'BUILD' ? 'bg-green-500/20' : 'bg-cream-500/10'
          }`}>{buildCount}</span>
        </button>
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

      {/* Toolbar */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-cream-200 uppercase tracking-wider mr-1">Review:</span>
          <button
            onClick={() => startFilteredReview(activeTab, guide, '', '')}
            disabled={navigating}
            className="px-4 py-1.5 text-xs uppercase tracking-wider border border-orange-500 bg-orange-500 text-white hover:bg-orange-600 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {navigating ? 'Loading...' : `Start ${activeTab === 'DESIGN' ? 'Design' : 'Build'} Review`}
          </button>

          <span className="border-l border-cream-500/30 mx-1 hidden sm:inline-block" />

          {starterProjects.map((sp) => (
            <button
              key={sp.id}
              onClick={() => setGuide(guide === sp.id ? '' : sp.id)}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
                guide === sp.id
                  ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                  : 'border-cream-500/30 text-cream-100 hover:border-orange-500'
              }`}
            >
              {sp.name}
              {stats?.guideCounts[sp.id] ? ` (${stats.guideCounts[sp.id]})` : ''}
            </button>
          ))}
          <button
            onClick={() => setGuide(guide === 'custom' ? '' : 'custom')}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
              guide === 'custom'
                ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                : 'border-cream-500/30 text-cream-100 hover:border-orange-500'
            }`}
          >
            Custom
            {stats?.guideCounts['custom'] ? ` (${stats.guideCounts['custom']})` : ''}
          </button>

          <span className="border-l border-cream-500/30 mx-1 hidden sm:inline-block" />

          <button
            onClick={() => startFilteredReview(activeTab, '', 'devboard', '')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Devboard (name)
          </button>
          <button
            onClick={() => startFilteredReview(activeTab, '', 'keyboard', '')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Keyboard (name)
          </button>
          <button
            onClick={() => startFilteredReview(activeTab, '', '', 'most_hours')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Most Hours
          </button>

          <span className="border-l border-cream-500/30 mx-1 hidden sm:inline-block" />

          <button
            onClick={() => startFilteredReview(activeTab, '', '', '', 'she/her')}
            disabled={navigating}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-pink-500/50 text-pink-300 hover:border-pink-400 hover:bg-pink-500/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            She/Her Priority
          </button>

          <span className="border-l border-cream-500/30 mx-1 hidden sm:inline-block" />

          <button
            onClick={() => setPrioritizeAttending(!prioritizeAttending)}
            title="Only show projects from users attending the in-person event"
            className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
              prioritizeAttending
                ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                : 'border-cream-500/30 text-cream-100 hover:border-orange-500'
            }`}
          >
            Filter Attendees
          </button>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as '' | 'na' | 'eu')}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider border cursor-pointer bg-brown-800 ${
              region
                ? 'border-orange-500 text-orange-400'
                : 'border-cream-500/30 text-cream-100 hover:border-orange-500'
            }`}
          >
            <option value="">All Regions</option>
            <option value="na">North America</option>
            <option value="eu">Europe</option>
          </select>

          <span className="border-l border-cream-500/30 mx-1 hidden sm:inline-block" />

          <span className="text-xs text-cream-200 uppercase tracking-wider">Tier:</span>
          {TIERS.map((t) => {
            const active = selectedTiers.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() =>
                  setSelectedTiers((prev) =>
                    prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                  )
                }
                title={`${t.name} (${t.bits} bits)`}
                className={`px-2.5 py-1.5 text-xs uppercase tracking-wider border cursor-pointer ${
                  active
                    ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                    : 'border-cream-500/30 text-cream-100 hover:border-orange-500'
                }`}
              >
                T{t.id}
              </button>
            );
          })}
          {selectedTiers.length > 0 && (
            <button
              onClick={() => setSelectedTiers([])}
              className="px-2.5 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-200 hover:border-orange-500 cursor-pointer"
            >
              Clear
            </button>
          )}

          {data?.isAdmin && !viewAsFirstPass && (
            <button
              onClick={() => setViewAsFirstPass(true)}
              title="Preview what first-pass reviewers see"
              className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/30 text-cream-100 hover:border-orange-500 cursor-pointer"
            >
              View as 1st-Pass
            </button>
          )}
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            ref={searchInputRef}
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
          <p className="text-cream-200">No {activeTab.toLowerCase()} submissions in queue</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto bg-brown-800 border border-cream-500/20 rounded">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-cream-500/20">
                  <th className="text-left text-xs uppercase tracking-wider text-cream-200 px-3 py-2">Title</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden lg:table-cell">Author</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden md:table-cell">Tier</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden md:table-cell">BOM</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden md:table-cell">$/h</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2 hidden md:table-cell">bits/h</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-200 px-3 py-2">
                    {activeTab === 'BUILD' ? 'Build Hours' : 'Work Units'}
                  </th>
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
                              {item.sheHerUS && <span title="She/Her · United States">⭐ </span>}
                              {item.title}
                            </p>
                            <div className="flex gap-1 items-center mt-0.5">
                              {item.preReviewed && data.isAdmin && (
                                <span className="text-xs text-orange-500 uppercase">Pre-reviewed</span>
                              )}
                              {item.attendanceStatus ? (
                                <Link
                                  href={`/admin/attendance?focus=${encodeURIComponent(item.author.id)}`}
                                  title={`Attendance: ${STATUS_LABEL[item.attendanceStatus]} — click to open in /admin/attendance`}
                                  className={`text-[10px] uppercase px-1 py-0.5 ${statusBg(item.attendanceStatus)}`}
                                >
                                  {STATUS_LABEL[item.attendanceStatus]}
                                </Link>
                              ) : item.attendingEvent && (
                                <span title="Attending the in-person event" className="text-[10px] uppercase px-1 py-0.5 bg-orange-500/20 text-orange-300 border border-orange-500/40">
                                  Attending
                                </span>
                              )}
                              {item.region === 'na' && (
                                <span className="text-[10px] uppercase px-1 py-0.5 bg-cream-500/10 text-cream-200 border border-cream-500/20">NA</span>
                              )}
                              {item.region === 'eu' && (
                                <span className="text-[10px] uppercase px-1 py-0.5 bg-cream-500/10 text-cream-200 border border-cream-500/20">EU</span>
                              )}
                            </div>
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
                        {activeTab === 'BUILD' && item.totalWorkUnits !== item.workUnits && (
                          <span className="text-cream-500 text-xs ml-1">/ {item.totalWorkUnits}h total</span>
                        )}
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
                            href={`/admin/review/${item.id}${useOldReviewUi ? '/old' : ''}?category=${activeTab}${guide ? `&guide=${guide}` : ''}${prioritizeAttending ? '&prioritizeAttending=true' : ''}${region ? `&region=${region}` : ''}${selectedTiers.length ? `&tiers=${selectedTiers.join(',')}` : ''}${viewAsFirstPass ? '&viewAs=first-pass' : ''}`}
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

          {data?.nextCursor && (
            <div ref={sentinelRef} className="flex justify-center py-4 text-xs uppercase tracking-wider text-cream-200">
              {loadingMore ? 'Loading more...' : 'Scroll for more'}
            </div>
          )}

        </>
      )}
    </>
  );
}

function QueueStatsPanel({ designCount, buildCount, designQueue, buildQueue, isAdmin }: Readonly<{
  designCount: number;
  buildCount: number;
  designQueue?: QueueStats;
  buildQueue?: QueueStats;
  isAdmin?: boolean;
}>) {
  return (
    <div className="bg-brown-800 border border-cream-500/20 p-4">
      <div className="grid grid-cols-2 divide-x divide-cream-500/10">
        <QueueReadout
          label="Design"
          count={designCount}
          queue={designQueue}
          isAdmin={isAdmin}
          color="blue"
          className="pr-5"
        />
        <QueueReadout
          label="Build"
          count={buildCount}
          queue={buildQueue}
          isAdmin={isAdmin}
          color="green"
          className="pl-5"
        />
      </div>
    </div>
  );
}

function QueueReadout({ label, count, queue, isAdmin, color, className }: Readonly<{
  label: string;
  count: number;
  queue?: QueueStats;
  isAdmin?: boolean;
  color: 'blue' | 'green';
  className?: string;
}>) {
  const countColor = color === 'blue' ? 'text-blue-400' : 'text-green-400';
  const longestIsLong = queue && queue.waitMaxMs > 7 * 24 * 60 * 60 * 1000;
  return (
    <div className={`flex items-start gap-6 ${className ?? ''}`}>
      {/* Count + metadata */}
      <div>
        <p className="text-cream-200 text-[10px] uppercase tracking-wider mb-1">{label}</p>
        <div className="flex items-center gap-3">
          <span className={`${countColor} text-3xl font-bold tabular-nums leading-none`}>{count}</span>
          <div className="flex flex-col">
            {queue && <span className="text-cream-300 text-xs tabular-nums leading-tight">{queue.workUnits}h queued</span>}
            {isAdmin && queue && queue.preReviewedCount > 0 && (
              <span className="text-orange-400 text-xs leading-tight">{queue.preReviewedCount} pre-reviewed</span>
            )}
          </div>
        </div>
      </div>
      {/* Wait times */}
      {queue && queue.count > 0 && (
        <div className="border-l border-cream-500/10 pl-6">
          <p className="text-cream-200 text-[10px] uppercase tracking-wider mb-1">Wait Time</p>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0 text-xs">
            <span className="text-cream-400">P50</span>
            <span className="text-cream-100 tabular-nums">{formatWaitTime(queue.waitP50Ms)}</span>
            <span className="text-cream-400">P95</span>
            <span className="text-cream-100 tabular-nums">{formatWaitTime(queue.waitP95Ms)}</span>
            <span className="text-cream-400">Max</span>
            {queue.waitMaxSubmissionId ? (
              <Link
                href={`/admin/review/${queue.waitMaxSubmissionId}`}
                className={`tabular-nums hover:underline ${longestIsLong ? 'text-orange-400' : 'text-cream-100'}`}
              >
                {formatWaitTime(queue.waitMaxMs)}
              </Link>
            ) : (
              <span className={`tabular-nums ${longestIsLong ? 'text-orange-400' : 'text-cream-100'}`}>
                {formatWaitTime(queue.waitMaxMs)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function A1MiniStats({ data, loading }: Readonly<{ data: A1MiniResponse | null; loading: boolean }>) {
  if (loading && !data) {
    return <span className="text-cream-200 text-sm">Loading...</span>;
  }
  if (!data || data.entries.length === 0) {
    return <span className="text-cream-200 text-sm">No reviews yet</span>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-cream-300 text-[11px] uppercase tracking-wider">
            <th className="text-left py-1 pr-3">Reviewer</th>
            {data.weeks.map((w, i) => (
              <th key={i} className={`text-center py-1 px-2 ${i === data.currentWeekIndex ? 'text-orange-400' : ''}`}>
                {w.replace(/Week \d+ \(/, '').replace(')', '')}
              </th>
            ))}
            <th className="text-center py-1 px-2">Raffle Pts</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((entry, i) => (
            <tr key={entry.reviewer.id} className="border-t border-cream-500/10">
              <td className="py-1 pr-3">
                <div className="flex items-center gap-2">
                  {entry.reviewer.image && (
                    <img src={entry.reviewer.image} alt="" className="w-5 h-5 rounded-full" />
                  )}
                  <Link
                    href={`/admin/users?search=${encodeURIComponent(entry.reviewer.id)}`}
                    className="text-cream-50 hover:text-orange-400 transition-colors whitespace-nowrap"
                  >
                    {entry.reviewer.name || 'Unknown'}
                  </Link>
                </div>
              </td>
              {entry.weekCounts.map((count, wi) => (
                <td key={wi} className={`text-center py-1 px-2 ${wi === data.currentWeekIndex ? 'text-orange-400' : 'text-cream-100'}`}>
                  {count > 0 ? (
                    <span>
                      {count}
                      {entry.weeklyRafflePoints[wi] > 0 && (
                        <span className="text-cream-400 text-[11px]"> ({entry.weeklyRafflePoints[wi]}pt)</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-cream-500">–</span>
                  )}
                </td>
              ))}
              <td className="text-center py-1 px-2 text-orange-500 font-bold">
                {entry.totalRafflePoints}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
