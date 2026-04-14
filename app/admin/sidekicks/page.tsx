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

interface Sidekick {
  id: string;
  name: string | null;
  image: string | null;
  slackId: string | null;
  assigneeCount: number;
  assignees: Assignee[];
}

interface UnassignedUser {
  id: string;
  name: string | null;
  image: string | null;
  slackId: string | null;
  createdAt: string;
}

function StatusBadge({ label, status }: { label: string; status: string }) {
  const color =
    status === 'approved' ? 'text-green-600' :
    status === 'rejected' ? 'text-red-600' :
    status === 'in_review' ? 'text-orange-500' :
    'text-cream-50';

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
  if (days === null) return 'border-cream-500/20';
  if (days <= 3) return 'border-green-500/60';
  if (days <= 7) return 'border-yellow-500/60';
  if (days <= 14) return 'border-orange-500/60';
  return 'border-red-500/60';
}

function activityBadge(days: number | null): { label: string; className: string } {
  if (days === null) return { label: 'No activity', className: 'bg-cream-400/20 text-cream-200' };
  if (days <= 3) return { label: `${days}d ago`, className: 'bg-green-600/20 text-green-500' };
  if (days <= 7) return { label: `${days}d ago`, className: 'bg-yellow-600/20 text-yellow-500' };
  if (days <= 14) return { label: `${days}d ago`, className: 'bg-orange-600/20 text-orange-500' };
  return { label: `${days}d ago`, className: 'bg-red-600/20 text-red-500' };
}

type ActivityFilter = 'all' | 'lt_3d' | '3_7d' | '7_14d' | '14d_plus' | 'never';
type ProjectFilter = 'all' | 'has_projects' | 'no_projects';
type SortOption = 'last_active' | 'name' | 'journals' | 'assigned';

function AssignDialog({
  userName,
  userId,
  sidekicks,
  currentSidekickId,
  onClose,
  onAssign,
}: {
  userName: string | null;
  userId: string;
  sidekicks: Sidekick[];
  currentSidekickId?: string;
  onClose: () => void;
  onAssign: (assigneeId: string, newSidekickId?: string) => Promise<void>;
}) {
  const [selectedSidekickId, setSelectedSidekickId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const availableSidekicks = currentSidekickId
    ? sidekicks.filter((s) => s.id !== currentSidekickId)
    : sidekicks;

  const isReassign = !!currentSidekickId;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onAssign(userId, selectedSidekickId || undefined);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-brown-800 border-2 border-cream-500/20 p-6 max-w-md w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-cream-50 text-lg uppercase">
          {isReassign ? 'Reassign' : 'Assign'} {userName ?? 'Unknown'}
        </h3>

        <div className="space-y-2">
          <label className="block text-cream-50 text-sm uppercase">
            {isReassign ? 'New Sidekick' : 'Sidekick'}
          </label>
          <select
            value={selectedSidekickId}
            onChange={(e) => setSelectedSidekickId(e.target.value)}
            className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm"
          >
            <option value="">Random (least loaded)</option>
            {availableSidekicks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? 'Unknown'} ({s.assigneeCount} assignee{s.assigneeCount !== 1 ? 's' : ''})
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs uppercase bg-brown-900 border border-cream-500/20 text-cream-50 hover:border-cream-500 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-xs uppercase bg-purple-600 text-white hover:bg-purple-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting ? (isReassign ? 'Reassigning...' : 'Assigning...') : (isReassign ? 'Reassign' : 'Assign')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSidekicksPage() {
  const [sidekicks, setSidekicks] = useState<Sidekick[]>([]);
  const [unassignedUsers, setUnassignedUsers] = useState<UnassignedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSidekick, setExpandedSidekick] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<{
    userId: string;
    userName: string | null;
    currentSidekickId?: string;
  } | null>(null);
  const [assigningAll, setAssigningAll] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('last_active');

  useEffect(() => {
    fetchSidekicks();
  }, []);

  async function fetchSidekicks() {
    try {
      const res = await fetch('/api/admin/sidekick');
      if (res.ok) {
        const data = await res.json();
        setSidekicks(data.sidekicks);
        setUnassignedUsers(data.unassignedUsers);
      }
    } catch (error) {
      console.error('Failed to fetch sidekicks:', error);
    } finally {
      setLoading(false);
    }
  }

  async function reassignIndividual(assigneeId: string, newSidekickId?: string) {
    try {
      const res = await fetch('/api/admin/sidekick/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeId, newSidekickId }),
      });
      if (res.ok) {
        fetchSidekicks();
      } else {
        const data = await res.json();
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to reassign:', error);
    }
  }

  async function reassignAll(sidekickId: string) {
    setReassigning(sidekickId);
    try {
      const res = await fetch('/api/admin/sidekick/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sidekickId }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Reassigned ${data.reassigned} assignee(s) to other sidekicks.`);
        fetchSidekicks();
      } else {
        const data = await res.json();
        alert(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to reassign:', error);
    } finally {
      setReassigning(null);
    }
  }

  function filterAndSortAssignees(assignees: Assignee[]): Assignee[] {
    let filtered = assignees;

    if (activityFilter !== 'all') {
      filtered = filtered.filter((a) => {
        const days = daysSince(a.lastActiveAt);
        switch (activityFilter) {
          case 'lt_3d': return days !== null && days < 3;
          case '3_7d': return days !== null && days >= 3 && days <= 7;
          case '7_14d': return days !== null && days > 7 && days <= 14;
          case '14d_plus': return days !== null && days > 14;
          case 'never': return days === null;
        }
      });
    }

    if (projectFilter !== 'all') {
      filtered = filtered.filter((a) => {
        if (projectFilter === 'has_projects') return a.projectCount > 0;
        return a.projectCount === 0;
      });
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

  const allAssignees = sidekicks.flatMap((s) => s.assignees);
  const totalLt3d = allAssignees.filter((a) => {
    const days = daysSince(a.lastActiveAt);
    return days !== null && days < 3;
  }).length;
  const total3to7d = allAssignees.filter((a) => {
    const days = daysSince(a.lastActiveAt);
    return days !== null && days >= 3 && days <= 7;
  }).length;
  const total7to14d = allAssignees.filter((a) => {
    const days = daysSince(a.lastActiveAt);
    return days !== null && days > 7 && days <= 14;
  }).length;
  const total14dPlus = allAssignees.filter((a) => {
    const days = daysSince(a.lastActiveAt);
    return days !== null && days > 14;
  }).length;
  const totalNeverActive = allAssignees.filter((a) => a.lastActiveAt === null).length;

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-cream-50">Loading sidekicks...</p>
      </div>
    );
  }

  if (sidekicks.length === 0) {
    return (
      <div className="bg-brown-800 border-2 border-cream-500/20 p-8 text-center">
        <p className="text-cream-50 text-lg uppercase mb-2">No sidekicks</p>
        <p className="text-cream-200 text-sm">
          Assign the SIDEKICK role to users from the Users tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-cream-50 text-sm uppercase">
          {sidekicks.length} sidekick{sidekicks.length !== 1 ? 's' : ''} &middot;{' '}
          {allAssignees.length} total assignees
          {totalLt3d > 0 && (
            <span className="text-green-500"> &middot; {totalLt3d} active &lt;3d</span>
          )}
          {total3to7d > 0 && (
            <span className="text-yellow-500"> &middot; {total3to7d} inactive 3-7d</span>
          )}
          {total7to14d > 0 && (
            <span className="text-orange-500"> &middot; {total7to14d} inactive 7-14d</span>
          )}
          {total14dPlus > 0 && (
            <span className="text-red-500"> &middot; {total14dPlus} inactive 14d+</span>
          )}
          {totalNeverActive > 0 && (
            <span className="text-cream-200"> &middot; {totalNeverActive} never active</span>
          )}
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-cream-200 text-xs uppercase">Activity:</span>
          {([
            ['all', 'All'],
            ['lt_3d', '<3d'],
            ['3_7d', '3-7d'],
            ['7_14d', '7-14d'],
            ['14d_plus', '14d+'],
            ['never', 'Never Active'],
          ] as [ActivityFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setActivityFilter(activityFilter === value ? 'all' : value)}
              className={`px-3 py-1.5 text-xs uppercase cursor-pointer transition-colors ${
                activityFilter === value
                  ? value === 'lt_3d' ? 'bg-green-600 text-white led-flicker'
                    : value === '3_7d' ? 'bg-yellow-600 text-white led-flicker'
                    : value === '7_14d' ? 'bg-orange-600 text-white led-flicker'
                    : value === '14d_plus' ? 'bg-red-600 text-white led-flicker'
                    : value === 'never' ? 'bg-cream-400 text-cream-50 led-flicker'
                    : 'bg-orange-500 text-cream-50 led-flicker'
                  : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
              }`}
            >
              {label}
            </button>
          ))}

          <span className="text-cream-400">|</span>
          <span className="text-cream-200 text-xs uppercase">Projects:</span>
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
                  ? 'bg-orange-500 text-cream-50 led-flicker'
                  : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
              }`}
            >
              {label}
            </button>
          ))}

          <span className="text-cream-400">|</span>
          <span className="text-cream-200 text-xs uppercase">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-1.5 text-xs uppercase"
          >
            <option value="last_active">Last Active (oldest first)</option>
            <option value="journals">Journals (fewest first)</option>
            <option value="name">Name</option>
            <option value="assigned">Recently Assigned</option>
          </select>

          {(activityFilter !== 'all' || projectFilter !== 'all') && (
            <button
              onClick={() => { setActivityFilter('all'); setProjectFilter('all'); }}
              className="px-3 py-1.5 text-xs uppercase text-cream-50 hover:text-orange-500 transition-colors cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {sidekicks.map((sidekick) => (
          <div
            key={sidekick.id}
            className="bg-brown-800 border-2 border-cream-500/20"
          >
            {/* Sidekick Header */}
            <div
              className="p-4 cursor-pointer hover:bg-cream-500/10 transition-colors"
              onClick={() =>
                setExpandedSidekick(
                  expandedSidekick === sidekick.id ? null : sidekick.id
                )
              }
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {sidekick.image ? (
                    <img
                      src={sidekick.image}
                      alt=""
                      className="w-10 h-10 flex-shrink-0 border-2 border-orange-500"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-cream-400 flex items-center justify-center flex-shrink-0 border-2 border-orange-500">
                      <span className="text-cream-50 text-sm">
                        {(sidekick.name ?? '?')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-cream-50 truncate">
                        {sidekick.name ?? 'Unknown'}
                      </p>
                      <span className="text-xs bg-purple-600 text-white px-2 py-0.5 uppercase">
                        Sidekick
                      </span>
                    </div>
                    <p className="text-cream-200 text-sm">
                      {sidekick.assigneeCount} assignee{sidekick.assigneeCount !== 1 ? 's' : ''}
                      {(() => {
                        const inactive = sidekick.assignees.filter((a) => {
                          const days = daysSince(a.lastActiveAt);
                          return days === null || days > 7;
                        }).length;
                        return inactive > 0 ? (
                          <span className="text-yellow-500"> &middot; {inactive} inactive</span>
                        ) : null;
                      })()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {sidekick.slackId && (
                    <a
                      href={`https://hackclub.slack.com/team/${sidekick.slackId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs uppercase bg-brown-900 border border-cream-500/20 text-cream-50 hover:border-cream-500 transition-colors hidden sm:block"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Slack
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        confirm(
                          `Reassign all of ${sidekick.name ?? 'this sidekick'}'s assignees to other sidekicks?`
                        )
                      ) {
                        reassignAll(sidekick.id);
                      }
                    }}
                    disabled={reassigning === sidekick.id || sidekick.assigneeCount === 0}
                    className="px-3 py-1.5 text-xs uppercase bg-purple-600 text-white hover:bg-purple-500 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {reassigning === sidekick.id ? 'Reassigning...' : 'Reassign All'}
                  </button>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`text-cream-50 transition-transform ${
                      expandedSidekick === sidekick.id ? 'rotate-180' : ''
                    }`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Expanded Assignee List */}
            {expandedSidekick === sidekick.id && (
              <div className="border-t border-cream-500/20 p-4">
                {sidekick.assignees.length === 0 ? (
                  <p className="text-cream-200 text-sm text-center py-4">
                    No assignees
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(() => {
                      const filtered = filterAndSortAssignees(sidekick.assignees);
                      if (filtered.length === 0) return (
                        <p className="text-cream-200 text-sm text-center py-4 col-span-full">
                          No assignees match current filters
                        </p>
                      );
                      return filtered.map((assignee) => {
                      const days = daysSince(assignee.lastActiveAt);
                      const activity = activityBadge(days);
                      return (
                      <div
                        key={assignee.id}
                        className={`bg-brown-900 border-2 ${activityColor(days)} p-3 space-y-2`}
                      >
                        {/* Assignee Header */}
                        <div className="flex items-center gap-3">
                          {assignee.image ? (
                            <img
                              src={assignee.image}
                              alt=""
                              className="w-8 h-8 flex-shrink-0 border-2 border-orange-500"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-cream-400 flex items-center justify-center flex-shrink-0 border-2 border-orange-500">
                              <span className="text-cream-50 text-xs">
                                {(assignee.name ?? '?')[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-cream-50 text-sm truncate">
                              {assignee.name ?? 'Unknown'}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-cream-200 text-xs">
                                Joined{' '}
                                {new Date(assignee.createdAt).toLocaleDateString(
                                  'en-US',
                                  { month: 'short', day: 'numeric', year: 'numeric' }
                                )}
                              </p>
                              <span className={`text-[10px] px-1.5 py-0.5 uppercase ${activity.className}`}>
                                {activity.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div className="bg-brown-800 p-1.5">
                            <p className="text-orange-500 text-sm font-bold">
                              {assignee.journalCount}
                            </p>
                            <p className="text-cream-200 text-[10px] uppercase">
                              Journals
                            </p>
                          </div>
                          <div className="bg-brown-800 p-1.5">
                            <p className="text-orange-500 text-sm font-bold">
                              {assignee.totalHours.toFixed(1)}
                            </p>
                            <p className="text-cream-200 text-[10px] uppercase">
                              Hours
                            </p>
                          </div>
                          <div className="bg-brown-800 p-1.5">
                            <p className="text-orange-500 text-sm font-bold">
                              {assignee.projectCount}
                            </p>
                            <p className="text-cream-200 text-[10px] uppercase">
                              Projects
                            </p>
                          </div>
                        </div>

                        {/* Projects */}
                        {assignee.projects.length > 0 && (
                          <div className="space-y-1">
                            {assignee.projects.map((project) => (
                              <div
                                key={project.id}
                                className="bg-brown-800 px-2 py-1 text-xs"
                              >
                                <p className="text-cream-50 truncate">
                                  {project.title}
                                </p>
                                <div className="flex gap-2 mt-0.5">
                                  <StatusBadge
                                    label="D"
                                    status={project.designStatus}
                                  />
                                  <StatusBadge
                                    label="B"
                                    status={project.buildStatus}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1 flex-wrap">
                          {assignee.slackId && (
                            <a
                              href={`https://hackclub.slack.com/team/${assignee.slackId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 text-[10px] uppercase bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500 transition-colors"
                            >
                              Slack
                            </a>
                          )}
                          <Link
                            href={`/dashboard/profile/${assignee.id}`}
                            className="px-2 py-1 text-[10px] uppercase bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500 transition-colors"
                          >
                            Profile
                          </Link>
                          <button
                            onClick={() =>
                              setAssignTarget({
                                userId: assignee.id,
                                userName: assignee.name,
                                currentSidekickId: sidekick.id,
                              })
                            }
                            className="px-2 py-1 text-[10px] uppercase bg-purple-600 text-white hover:bg-purple-500 transition-colors cursor-pointer"
                          >
                            Reassign
                          </button>
                        </div>
                      </div>
                      );
                    });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Unassigned Users */}
      {unassignedUsers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-cream-50 text-sm uppercase">
              {unassignedUsers.length} unassigned user{unassignedUsers.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={async () => {
                if (!confirm(`Assign all ${unassignedUsers.length} unassigned user(s) to sidekicks?`)) return;
                setAssigningAll(true);
                try {
                  const res = await fetch('/api/admin/sidekick/reassign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assignAllUnassigned: true }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    alert(`Assigned ${data.assigned} user(s) to sidekicks.`);
                    fetchSidekicks();
                  } else {
                    const data = await res.json();
                    alert(`Failed: ${data.error || 'Unknown error'}`);
                  }
                } catch (error) {
                  console.error('Failed to assign all:', error);
                } finally {
                  setAssigningAll(false);
                }
              }}
              disabled={assigningAll}
              className="px-3 py-1.5 text-xs uppercase bg-purple-600 text-white hover:bg-purple-500 transition-colors cursor-pointer disabled:opacity-50"
            >
              {assigningAll ? 'Assigning...' : 'Assign All'}
            </button>
          </div>
          <div className="bg-brown-800 border-2 border-cream-500/20 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {unassignedUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-brown-900 border border-cream-500/20 p-3 flex items-center gap-3"
                >
                  <img
                    src={user.image || '/default_slack.png'}
                    alt=""
                    className="w-8 h-8 flex-shrink-0 border-2 border-orange-500"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-cream-50 text-sm truncate">
                      {user.name ?? 'Unknown'}
                    </p>
                    <p className="text-cream-200 text-xs">
                      Joined{' '}
                      {new Date(user.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setAssignTarget({
                        userId: user.id,
                        userName: user.name,
                      })
                    }
                    className="px-2 py-1 text-[10px] uppercase bg-purple-600 text-white hover:bg-purple-500 transition-colors cursor-pointer flex-shrink-0"
                  >
                    Assign
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {assignTarget && (
        <AssignDialog
          userName={assignTarget.userName}
          userId={assignTarget.userId}
          sidekicks={sidekicks}
          currentSidekickId={assignTarget.currentSidekickId}
          onClose={() => setAssignTarget(null)}
          onAssign={reassignIndividual}
        />
      )}
    </div>
  );
}
