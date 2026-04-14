'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface AssigneeProject {
  id: string;
  title: string;
  designStatus: string;
  buildStatus: string;
}

interface Assignee {
  id: string;
  name: string | null;
  image: string | null;
  slackId: string | null;
  createdAt: string;
  assignedAt: string;
  journalCount: number;
  totalHours: number;
  projectCount: number;
  lastActiveAt: string | null;
  projects: AssigneeProject[];
}

type ActivityFilter = 'all' | 'active' | 'inactive_7' | 'inactive_14' | 'never';
type ProjectFilter = 'all' | 'has_projects' | 'no_projects';
type SortOption = 'last_active' | 'name' | 'journals' | 'assigned';

function StatusBadge({ label, status }: { label: string; status: string }) {
  const color =
    status === 'approved' ? 'text-green-600' :
    status === 'rejected' ? 'text-red-600' :
    status === 'in_review' ? 'text-brand-500' :
    'text-cream-700';

  return (
    <span className={`text-xs uppercase ${color}`}>
      {label}: {status.replace('_', ' ')}
    </span>
  );
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function activityColor(days: number | null): string {
  if (days === null) return 'border-cream-400';
  if (days <= 3) return 'border-green-500';
  if (days <= 7) return 'border-yellow-500';
  if (days <= 14) return 'border-orange-500';
  return 'border-red-500';
}

function activityBadge(days: number | null): { label: string; className: string } {
  if (days === null) return { label: 'No activity', className: 'bg-cream-300 text-cream-600' };
  if (days <= 3) return { label: `${days}d ago`, className: 'bg-green-100 text-green-700' };
  if (days <= 7) return { label: `${days}d ago`, className: 'bg-yellow-100 text-yellow-700' };
  if (days <= 14) return { label: `${days}d ago`, className: 'bg-orange-100 text-orange-700' };
  return { label: `${days}d ago`, className: 'bg-red-100 text-red-700' };
}

export default function SidekickPage() {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('last_active');

  useEffect(() => {
    async function fetchAssignees() {
      try {
        const res = await fetch('/api/sidekick/assignees');
        if (res.ok) {
          const data = await res.json();
          setAssignees(data);
        }
      } catch (error) {
        console.error('Failed to fetch assignees:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchAssignees();
  }, []);

  function filterAndSort(list: Assignee[]): Assignee[] {
    let filtered = list;

    if (activityFilter !== 'all') {
      filtered = filtered.filter((a) => {
        const days = daysSince(a.lastActiveAt);
        switch (activityFilter) {
          case 'active': return days !== null && days <= 7;
          case 'inactive_7': return days === null || days > 7;
          case 'inactive_14': return days === null || days > 14;
          case 'never': return days === null;
        }
      });
    }

    if (projectFilter !== 'all') {
      filtered = filtered.filter((a) =>
        projectFilter === 'has_projects' ? a.projectCount > 0 : a.projectCount === 0
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'last_active': {
          const aDays = daysSince(a.lastActiveAt);
          const bDays = daysSince(b.lastActiveAt);
          if (aDays === null && bDays === null) return 0;
          if (aDays === null) return 1;
          if (bDays === null) return -1;
          return bDays - aDays;
        }
        case 'name':
          return (a.name ?? '').localeCompare(b.name ?? '');
        case 'journals':
          return a.journalCount - b.journalCount;
        case 'assigned':
          return new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime();
      }
    });

    return filtered;
  }

  function buildCsvUrl(): string {
    const params = new URLSearchParams({ format: 'csv' });
    if (activityFilter !== 'all') params.set('activity', activityFilter);
    if (projectFilter !== 'all') params.set('projects', projectFilter);
    return `/api/sidekick/assignees?${params}`;
  }

  const inactive7 = assignees.filter((a) => {
    const d = daysSince(a.lastActiveAt);
    return d === null || d > 7;
  }).length;
  const inactive14 = assignees.filter((a) => {
    const d = daysSince(a.lastActiveAt);
    return d === null || d > 14;
  }).length;
  const neverActive = assignees.filter((a) => a.lastActiveAt === null).length;
  const displayed = filterAndSort(assignees);

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-cream-700">Loading assignees...</p>
      </div>
    );
  }

  if (assignees.length === 0) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
        <p className="text-cream-700 text-lg uppercase mb-2">No assignees yet</p>
        <p className="text-cream-600 text-sm">
          New users will be automatically assigned to you as a sidekick.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Stats */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-cream-700 text-sm uppercase">
            {assignees.length} assignee{assignees.length !== 1 ? 's' : ''}
            {inactive7 > 0 && (
              <span className="text-yellow-600"> &middot; {inactive7} inactive 7d+</span>
            )}
            {inactive14 > 0 && (
              <span className="text-red-600"> &middot; {inactive14} inactive 14d+</span>
            )}
            {neverActive > 0 && (
              <span className="text-cream-500"> &middot; {neverActive} never active</span>
            )}
          </p>
          <button
            onClick={() => { window.location.href = buildCsvUrl(); }}
            className="px-3 py-1.5 text-xs uppercase bg-cream-200 border border-cream-400 text-cream-800 hover:border-cream-500 transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-cream-600 text-xs uppercase">Activity:</span>
          {([
            ['all', 'All'],
            ['active', 'Active (7d)'],
            ['inactive_7', 'Inactive 7d+'],
            ['inactive_14', 'Inactive 14d+'],
            ['never', 'Never Active'],
          ] as [ActivityFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActivityFilter(activityFilter === value ? 'all' : value)}
              className={`px-3 py-1.5 text-xs uppercase cursor-pointer transition-colors ${
                activityFilter === value
                  ? value === 'active' ? 'bg-green-600 text-white'
                    : value === 'inactive_7' ? 'bg-yellow-600 text-white'
                    : value === 'inactive_14' ? 'bg-red-600 text-white'
                    : value === 'never' ? 'bg-cream-500 text-white'
                    : 'bg-brand-500 text-white'
                  : 'bg-cream-200 border border-cream-400 text-cream-800 hover:border-cream-500'
              }`}
            >
              {label}
            </button>
          ))}

          <span className="text-cream-400">|</span>
          <span className="text-cream-600 text-xs uppercase">Projects:</span>
          {([
            ['all', 'All'],
            ['has_projects', 'Has Projects'],
            ['no_projects', 'No Projects'],
          ] as [ProjectFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setProjectFilter(projectFilter === value ? 'all' : value)}
              className={`px-3 py-1.5 text-xs uppercase cursor-pointer transition-colors ${
                projectFilter === value
                  ? 'bg-brand-500 text-white'
                  : 'bg-cream-200 border border-cream-400 text-cream-800 hover:border-cream-500'
              }`}
            >
              {label}
            </button>
          ))}

          <span className="text-cream-400">|</span>
          <span className="text-cream-600 text-xs uppercase">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-cream-200 border border-cream-400 text-cream-800 px-3 py-1.5 text-xs uppercase"
          >
            <option value="last_active">Last Active (oldest first)</option>
            <option value="journals">Journals (fewest first)</option>
            <option value="name">Name</option>
            <option value="assigned">Recently Assigned</option>
          </select>

          {(activityFilter !== 'all' || projectFilter !== 'all') && (
            <button
              onClick={() => { setActivityFilter('all'); setProjectFilter('all'); }}
              className="px-3 py-1.5 text-xs uppercase text-cream-700 hover:text-brand-500 transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Assignee Grid */}
      {displayed.length === 0 ? (
        <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
          <p className="text-cream-600 text-sm">No assignees match current filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((assignee) => {
            const days = daysSince(assignee.lastActiveAt);
            const activity = activityBadge(days);
            return (
              <div
                key={assignee.id}
                className={`bg-cream-100 border-2 ${activityColor(days)} p-4 space-y-3`}
              >
                {/* Avatar + Name */}
                <div className="flex items-center gap-3">
                  {assignee.image ? (
                    <img
                      src={assignee.image}
                      alt=""
                      className="w-10 h-10 flex-shrink-0 border-2 border-orange-500"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-cream-400 flex items-center justify-center flex-shrink-0 border-2 border-orange-500">
                      <span className="text-cream-800 text-sm">
                        {(assignee.name ?? '?')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-cream-800 truncate">{assignee.name ?? 'Unknown'}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-cream-600 text-xs">
                        Joined {new Date(assignee.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                      <span className={`text-[10px] px-1.5 py-0.5 uppercase ${activity.className}`}>
                        {activity.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-cream-200 p-2">
                    <p className="text-brand-500 text-lg font-bold">{assignee.journalCount}</p>
                    <p className="text-cream-600 text-xs uppercase">Journals</p>
                  </div>
                  <div className="bg-cream-200 p-2">
                    <p className="text-brand-500 text-lg font-bold">{assignee.totalHours.toFixed(1)}</p>
                    <p className="text-cream-600 text-xs uppercase">Hours</p>
                  </div>
                  <div className="bg-cream-200 p-2">
                    <p className="text-brand-500 text-lg font-bold">{assignee.projectCount}</p>
                    <p className="text-cream-600 text-xs uppercase">Projects</p>
                  </div>
                </div>

                {/* Projects */}
                {assignee.projects.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-cream-600 text-xs uppercase">Projects</p>
                    {assignee.projects.map((project) => (
                      <div key={project.id} className="bg-cream-200 px-2 py-1.5 text-sm">
                        <p className="text-cream-800 truncate">{project.title}</p>
                        <div className="flex gap-2 mt-0.5">
                          <StatusBadge label="D" status={project.designStatus} />
                          <StatusBadge label="B" status={project.buildStatus} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  {assignee.slackId && (
                    <a
                      href={`https://hackclub.slack.com/team/${assignee.slackId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs uppercase bg-cream-200 border border-cream-400 text-cream-800 hover:border-cream-500 transition-colors"
                    >
                      DM on Slack
                    </a>
                  )}
                  <Link
                    href={`/dashboard/profile/${assignee.id}`}
                    className="px-3 py-1.5 text-xs uppercase bg-cream-200 border border-cream-400 text-cream-800 hover:border-cream-500 transition-colors"
                  >
                    View Profile
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
