'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getTierById, TIERS } from '@/lib/tiers';
import { STARTER_PROJECT_NAMES } from '@/lib/starter-projects';

interface ProjectUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface ProjectItem {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  tier: number | null;
  designStatus: string;
  buildStatus: string;
  isStarter: boolean;
  starterProjectId: string | null;
  hiddenFromGallery: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: ProjectUser;
  totalHoursClaimed: number;
  totalHoursApproved: number;
  sessionCount: number;
}

interface ListResponse {
  items: ProjectItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_OPTIONS = ['draft', 'in_review', 'update_requested', 'approved', 'rejected'] as const;

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-brown-900 text-cream-50',
  in_review: 'bg-yellow-100 text-yellow-800',
  update_requested: 'bg-orange-100 text-orange-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  update_requested: 'Changes Req.',
  approved: 'Approved',
  rejected: 'Rejected',
};

const TIER_COLORS: Record<number, string> = {
  1: 'bg-gray-200 text-gray-800',
  2: 'bg-green-200 text-green-800',
  3: 'bg-blue-200 text-blue-800',
  4: 'bg-purple-200 text-purple-800',
  5: 'bg-orange-200 text-orange-800',
};

export default function AdminProjectsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [designStatus, setDesignStatus] = useState('');
  const [buildStatus, setBuildStatus] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [starterFilter, setStarterFilter] = useState('');
  const [hiddenFilter, setHiddenFilter] = useState('');
  const [zeroGrant, setZeroGrant] = useState(false);
  const [deletedFilter, setDeletedFilter] = useState('');
  const [page, setPage] = useState(1);

  // Airtable sync
  const [unsyncedProjects, setUnsyncedProjects] = useState<Array<{
    id: string; title: string; tier: number | null; stage: string;
    reviewedAt: string | null; userName: string | null; userEmail: string;
  }> | null>(null);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);
  const [checkingSync, setCheckingSync] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [syncingProject, setSyncingProject] = useState<string | null>(null);

  const checkAirtableSync = useCallback(async () => {
    setCheckingSync(true);
    setSyncProgress(null);
    try {
      const res = await fetch('/api/admin/projects/unsynced');
      if (res.ok) {
        const data = await res.json();
        setUnsyncedProjects(data.unsynced);
        setSyncedCount(data.syncedCount);
      }
    } catch {
      setSyncProgress('Failed to check Airtable sync status.');
    } finally {
      setCheckingSync(false);
    }
  }, []);

  const syncSingleProject = useCallback(async (projectId: string) => {
    setSyncingProject(projectId);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/sync-to-airtable`, { method: 'POST' });
      if (res.ok) {
        setUnsyncedProjects(prev => prev?.filter(p => !(p.id === projectId)) ?? null);
        setSyncProgress(`Synced project ${projectId}.`);
      } else {
        const err = await res.json();
        setSyncProgress(`Failed to sync ${projectId}: ${err.error}`);
      }
    } catch {
      setSyncProgress(`Network error syncing ${projectId}.`);
    } finally {
      setSyncingProject(null);
    }
  }, []);

  const syncAllUnsynced = useCallback(async () => {
    if (!unsyncedProjects?.length) return;
    setSyncingAll(true);
    let synced = 0;
    let failed = 0;
    for (const p of unsyncedProjects) {
      setSyncProgress(`Syncing ${synced + failed + 1}/${unsyncedProjects.length}: ${p.title}...`);
      try {
        const res = await fetch(`/api/admin/projects/${p.id}/sync-to-airtable`, { method: 'POST' });
        if (res.ok) synced++;
        else failed++;
      } catch {
        failed++;
      }
      // Respect Airtable rate limit
      await new Promise(r => setTimeout(r, 250));
    }
    setSyncProgress(`Done: ${synced} synced, ${failed} failed.`);
    setSyncingAll(false);
    // Re-check
    checkAirtableSync();
  }, [unsyncedProjects, checkAirtableSync]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (designStatus) params.set('designStatus', designStatus);
      if (buildStatus) params.set('buildStatus', buildStatus);
      if (tierFilter) params.set('tier', tierFilter);
      if (starterFilter) params.set('starter', starterFilter);
      if (hiddenFilter) params.set('hidden', hiddenFilter);
      if (zeroGrant) params.set('zeroGrant', 'true');
      if (deletedFilter) params.set('deleted', deletedFilter);
      params.set('page', page.toString());
      const res = await fetch(`/api/admin/projects/list?${params}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  }, [search, designStatus, buildStatus, tierFilter, starterFilter, hiddenFilter, zeroGrant, deletedFilter, page]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setSearchInput('');
    setDesignStatus('');
    setBuildStatus('');
    setTierFilter('');
    setStarterFilter('');
    setHiddenFilter('');
    setZeroGrant(false);
    setDeletedFilter('');
    setPage(1);
  };

  const hasFilters = search || designStatus || buildStatus || tierFilter || starterFilter || hiddenFilter || zeroGrant || deletedFilter;

  return (
    <>
      {/* Summary */}
      <div className="mb-6 bg-brown-800 border-2 border-cream-500/20 p-4 flex items-center justify-between">
        <div>
          <p className="text-cream-50 text-xs uppercase tracking-wider mb-1">Total Projects</p>
          <p className="text-orange-500 text-2xl font-bold">{data?.total ?? '...'}</p>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 cursor-pointer"
          >
            Clear All Filters
          </button>
        )}
      </div>

      {/* Airtable Sync */}
      <div className="mb-6 bg-brown-800 border-2 border-cream-500/20 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider">Airtable Sync</h2>
          <div className="flex gap-2">
            {unsyncedProjects && unsyncedProjects.length > 0 && (
              <button
                onClick={syncAllUnsynced}
                disabled={syncingAll || checkingSync}
                className="px-3 py-1.5 text-xs uppercase bg-red-600 text-white hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                {syncingAll ? 'Syncing...' : `Sync All (${unsyncedProjects.length})`}
              </button>
            )}
            <button
              onClick={checkAirtableSync}
              disabled={checkingSync || syncingAll}
              className="px-3 py-1.5 text-xs uppercase bg-orange-500 text-white hover:bg-orange-400 transition-colors cursor-pointer disabled:opacity-50"
            >
              {checkingSync ? 'Checking...' : 'Check Airtable Sync'}
            </button>
          </div>
        </div>
        {syncProgress && <p className="text-cream-50 text-xs mb-2">{syncProgress}</p>}
        {unsyncedProjects !== null && (
          unsyncedProjects.length === 0 ? (
            <p className="text-green-500 text-xs">All {syncedCount} approved projects are synced to Airtable.</p>
          ) : (
            <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
              {unsyncedProjects.map((p) => (
                <div key={`${p.id}-${p.stage}`} className="flex items-center justify-between bg-brown-900 px-3 py-2 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-1.5 py-0.5 uppercase ${p.stage === 'Build' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
                      {p.stage}
                    </span>
                    {p.tier && <span className="text-cream-200">T{p.tier}</span>}
                    <span className="text-cream-50 truncate">{p.title}</span>
                    <span className="text-cream-200 truncate">{p.userName || p.userEmail}</span>
                  </div>
                  <button
                    onClick={() => syncSingleProject(p.id)}
                    disabled={syncingProject === p.id || syncingAll}
                    className="px-2 py-1 text-xs uppercase bg-orange-500 text-white hover:bg-orange-400 transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ml-2"
                  >
                    {syncingProject === p.id ? '...' : 'Sync'}
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title, author, email, or ID..."
            className="px-3 py-1.5 text-sm border border-cream-500/20 bg-brown-800 text-cream-50 placeholder:text-cream-300 focus:outline-none focus:border-orange-500 flex-1 max-w-md"
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
              className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-500/20 text-cream-50 hover:border-orange-500 cursor-pointer"
            >
              Clear
            </button>
          )}
        </form>

        {/* Filter rows */}
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {/* Design Status */}
          <div className="flex items-center gap-2">
            <span className="text-cream-50 text-xs uppercase tracking-wider">Design:</span>
            <div className="flex gap-1">
              <FilterButton active={designStatus === ''} onClick={() => { setDesignStatus(''); setPage(1); }} label="All" />
              {STATUS_OPTIONS.map((s) => (
                <FilterButton key={s} active={designStatus === s} onClick={() => { setDesignStatus(s); setPage(1); }} label={STATUS_LABELS[s]} />
              ))}
            </div>
          </div>

          {/* Build Status */}
          <div className="flex items-center gap-2">
            <span className="text-cream-50 text-xs uppercase tracking-wider">Build:</span>
            <div className="flex gap-1">
              <FilterButton active={buildStatus === ''} onClick={() => { setBuildStatus(''); setPage(1); }} label="All" />
              {STATUS_OPTIONS.map((s) => (
                <FilterButton key={s} active={buildStatus === s} onClick={() => { setBuildStatus(s); setPage(1); }} label={STATUS_LABELS[s]} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {/* Tier */}
          <div className="flex items-center gap-2">
            <span className="text-cream-50 text-xs uppercase tracking-wider">Tier:</span>
            <div className="flex gap-1">
              <FilterButton active={tierFilter === ''} onClick={() => { setTierFilter(''); setPage(1); }} label="All" />
              {TIERS.map((t) => (
                <FilterButton key={t.id} active={tierFilter === String(t.id)} onClick={() => { setTierFilter(String(t.id)); setPage(1); }} label={`T${t.id}`} />
              ))}
              <FilterButton active={tierFilter === 'none'} onClick={() => { setTierFilter('none'); setPage(1); }} label="None" />
            </div>
          </div>

          {/* Starter */}
          <div className="flex items-center gap-2">
            <span className="text-cream-50 text-xs uppercase tracking-wider">Type:</span>
            <div className="flex gap-1">
              <FilterButton active={starterFilter === ''} onClick={() => { setStarterFilter(''); setPage(1); }} label="All" />
              <FilterButton active={starterFilter === 'true'} onClick={() => { setStarterFilter('true'); setPage(1); }} label="Starter" />
              <FilterButton active={starterFilter === 'false'} onClick={() => { setStarterFilter('false'); setPage(1); }} label="Custom" />
            </div>
          </div>

          {/* Hidden */}
          <div className="flex items-center gap-2">
            <span className="text-cream-50 text-xs uppercase tracking-wider">Visibility:</span>
            <div className="flex gap-1">
              <FilterButton active={hiddenFilter === ''} onClick={() => { setHiddenFilter(''); setPage(1); }} label="All" />
              <FilterButton active={hiddenFilter === 'false'} onClick={() => { setHiddenFilter('false'); setPage(1); }} label="Visible" />
              <FilterButton active={hiddenFilter === 'true'} onClick={() => { setHiddenFilter('true'); setPage(1); }} label="Hidden" />
            </div>
          </div>

          {/* $0 Grant */}
          <div className="flex items-center gap-2">
            <span className="text-cream-50 text-xs uppercase tracking-wider">Grant:</span>
            <div className="flex gap-1">
              <FilterButton active={!zeroGrant} onClick={() => { setZeroGrant(false); setPage(1); }} label="All" />
              <FilterButton active={zeroGrant} onClick={() => { setZeroGrant(true); setPage(1); }} label="$0 Grant" />
            </div>
          </div>

          {/* Deleted */}
          <div className="flex items-center gap-2">
            <span className="text-cream-50 text-xs uppercase tracking-wider">Deleted:</span>
            <div className="flex gap-1">
              <FilterButton active={deletedFilter === ''} onClick={() => { setDeletedFilter(''); setPage(1); }} label="All" />
              <FilterButton active={deletedFilter === 'true'} onClick={() => { setDeletedFilter('true'); setPage(1); }} label="Deleted" />
              <FilterButton active={deletedFilter === 'false'} onClick={() => { setDeletedFilter('false'); setPage(1); }} label="Not Deleted" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-cream-50">Loading projects...</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="bg-brown-800 border-2 border-cream-500/20 p-8 text-center">
          <p className="text-cream-50">No projects found</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-cream-500/20">
                  <th className="text-left text-xs uppercase tracking-wider text-cream-50 px-3 py-2">Project</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-50 px-3 py-2 hidden lg:table-cell">Author</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-50 px-3 py-2">Design</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-50 px-3 py-2">Build</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-50 px-3 py-2 hidden md:table-cell">Tier</th>
                  <th className="text-left text-xs uppercase tracking-wider text-cream-50 px-3 py-2 hidden md:table-cell">Type</th>
                  <th className="text-right text-xs uppercase tracking-wider text-cream-50 px-3 py-2 hidden md:table-cell">Hours</th>
                  <th className="text-center text-xs uppercase tracking-wider text-cream-50 px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((project) => {
                  const tierInfo = project.tier ? getTierById(project.tier) : null;
                  const starterName = project.starterProjectId ? STARTER_PROJECT_NAMES[project.starterProjectId] : null;

                  return (
                    <tr
                      key={project.id}
                      className={`border-b border-cream-500/10 hover:bg-cream-500/5 transition-colors ${project.hiddenFromGallery ? 'opacity-60' : ''} ${project.deletedAt ? 'border-l-4 border-l-red-500 bg-red-50/30' : ''}`}
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {project.coverImage && (
                            <img
                              src={project.coverImage}
                              alt=""
                              className="w-8 h-8 object-cover border border-cream-500/20 flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-[200px] text-cream-50">
                              {project.title}
                            </p>
                            {project.deletedAt && (
                              <span className="text-xs text-red-600 uppercase font-medium">Deleted</span>
                            )}
                            {project.hiddenFromGallery && !project.deletedAt && (
                              <span className="text-xs text-gray-500 uppercase">Hidden</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          {project.user.image && (
                            <img src={project.user.image} alt="" className="w-5 h-5 rounded-full" />
                          )}
                          <span className="text-sm text-cream-50 truncate max-w-[120px]">
                            {project.user.name || project.user.email}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs uppercase px-2 py-0.5 ${STATUS_COLORS[project.designStatus] || ''}`}>
                          {STATUS_LABELS[project.designStatus] || project.designStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs uppercase px-2 py-0.5 ${STATUS_COLORS[project.buildStatus] || ''}`}>
                          {STATUS_LABELS[project.buildStatus] || project.buildStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {tierInfo ? (
                          <span className={`text-xs px-2 py-0.5 ${TIER_COLORS[project.tier!] || ''}`}>
                            {tierInfo.name}
                          </span>
                        ) : (
                          <span className="text-xs text-cream-200">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 hidden md:table-cell">
                        {project.isStarter ? (
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800">
                            {starterName || 'Starter'}
                          </span>
                        ) : (
                          <span className="text-xs text-cream-200">Custom</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-sm text-cream-50 hidden md:table-cell">
                        {project.totalHoursClaimed.toFixed(1)}h
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Link
                          href={`/admin/projects/${project.id}`}
                          className="inline-block px-3 py-1 text-xs uppercase tracking-wider border border-orange-500 text-orange-500 hover:bg-orange-500/10 transition-colors"
                        >
                          View
                        </Link>
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
                className="px-3 py-1.5 text-xs uppercase border border-cream-500/20 text-cream-50 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="text-sm text-cream-50">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="px-3 py-1.5 text-xs uppercase border border-cream-500/20 text-cream-50 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
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

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs uppercase tracking-wider border cursor-pointer transition-colors ${
        active
          ? 'border-orange-500 text-orange-500 bg-orange-500/10'
          : 'border-cream-500/20 text-cream-50 hover:border-orange-500'
      }`}
    >
      {label}
    </button>
  );
}
