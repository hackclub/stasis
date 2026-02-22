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

function StatusBadge({ label, status }: { label: string; status: string }) {
  const color =
    status === 'approved' ? 'text-green-600' :
    status === 'rejected' ? 'text-red-600' :
    status === 'in_review' ? 'text-orange-500' :
    'text-brown-800';

  return (
    <span className={`text-xs uppercase ${color}`}>
      {label}: {status.replace('_', ' ')}
    </span>
  );
}

export default function AdminSidekicksPage() {
  const [sidekicks, setSidekicks] = useState<Sidekick[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSidekick, setExpandedSidekick] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<string | null>(null);

  useEffect(() => {
    fetchSidekicks();
  }, []);

  async function fetchSidekicks() {
    try {
      const res = await fetch('/api/admin/sidekick');
      if (res.ok) {
        const data = await res.json();
        setSidekicks(data);
      }
    } catch (error) {
      console.error('Failed to fetch sidekicks:', error);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-brown-800">Loading sidekicks...</p>
      </div>
    );
  }

  if (sidekicks.length === 0) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
        <p className="text-brown-800 text-lg uppercase mb-2">No sidekicks</p>
        <p className="text-cream-600 text-sm">
          Assign the SIDEKICK role to users from the Users tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-brown-800 text-sm uppercase">
        {sidekicks.length} sidekick{sidekicks.length !== 1 ? 's' : ''} &middot;{' '}
        {sidekicks.reduce((sum, s) => sum + s.assigneeCount, 0)} total assignees
      </p>

      <div className="space-y-4">
        {sidekicks.map((sidekick) => (
          <div
            key={sidekick.id}
            className="bg-cream-100 border-2 border-cream-400"
          >
            {/* Sidekick Header */}
            <div
              className="p-4 cursor-pointer hover:bg-cream-200 transition-colors"
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
                      className="w-10 h-10 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-cream-400 flex items-center justify-center flex-shrink-0">
                      <span className="text-brown-800 text-sm">
                        {(sidekick.name ?? '?')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-brown-800 truncate">
                        {sidekick.name ?? 'Unknown'}
                      </p>
                      <span className="text-xs bg-purple-600 text-white px-2 py-0.5 uppercase">
                        Sidekick
                      </span>
                    </div>
                    <p className="text-cream-600 text-sm">
                      {sidekick.assigneeCount} assignee{sidekick.assigneeCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {sidekick.slackId && (
                    <a
                      href={`https://hackclub.slack.com/team/${sidekick.slackId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs uppercase bg-cream-200 border border-cream-400 text-brown-800 hover:border-cream-500 transition-colors hidden sm:block"
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
                    className={`text-brown-800 transition-transform ${
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
              <div className="border-t border-cream-400 p-4">
                {sidekick.assignees.length === 0 ? (
                  <p className="text-cream-600 text-sm text-center py-4">
                    No assignees
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sidekick.assignees.map((assignee) => (
                      <div
                        key={assignee.id}
                        className="bg-cream-200 border border-cream-400 p-3 space-y-2"
                      >
                        {/* Assignee Header */}
                        <div className="flex items-center gap-3">
                          {assignee.image ? (
                            <img
                              src={assignee.image}
                              alt=""
                              className="w-8 h-8 rounded-full flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-cream-400 flex items-center justify-center flex-shrink-0">
                              <span className="text-brown-800 text-xs">
                                {(assignee.name ?? '?')[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-brown-800 text-sm truncate">
                              {assignee.name ?? 'Unknown'}
                            </p>
                            <p className="text-cream-600 text-xs">
                              Joined{' '}
                              {new Date(assignee.createdAt).toLocaleDateString(
                                'en-US',
                                { month: 'short', day: 'numeric', year: 'numeric' }
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-1 text-center">
                          <div className="bg-cream-100 p-1.5">
                            <p className="text-orange-500 text-sm font-bold">
                              {assignee.journalCount}
                            </p>
                            <p className="text-cream-600 text-[10px] uppercase">
                              Journals
                            </p>
                          </div>
                          <div className="bg-cream-100 p-1.5">
                            <p className="text-orange-500 text-sm font-bold">
                              {assignee.totalHours.toFixed(1)}
                            </p>
                            <p className="text-cream-600 text-[10px] uppercase">
                              Hours
                            </p>
                          </div>
                          <div className="bg-cream-100 p-1.5">
                            <p className="text-orange-500 text-sm font-bold">
                              {assignee.projectCount}
                            </p>
                            <p className="text-cream-600 text-[10px] uppercase">
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
                                className="bg-cream-100 px-2 py-1 text-xs"
                              >
                                <p className="text-brown-800 truncate">
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
                        <div className="flex gap-2 pt-1">
                          {assignee.slackId && (
                            <a
                              href={`https://hackclub.slack.com/team/${assignee.slackId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 text-[10px] uppercase bg-cream-100 border border-cream-400 text-brown-800 hover:border-cream-500 transition-colors"
                            >
                              Slack
                            </a>
                          )}
                          <Link
                            href={`/dashboard/profile/${assignee.id}`}
                            className="px-2 py-1 text-[10px] uppercase bg-cream-100 border border-cream-400 text-brown-800 hover:border-cream-500 transition-colors"
                          >
                            Profile
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
