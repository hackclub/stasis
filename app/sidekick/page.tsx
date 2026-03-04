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

export default function SidekickPage() {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);

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
      <p className="text-cream-700 text-sm uppercase">
        {assignees.length} assignee{assignees.length !== 1 ? 's' : ''}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assignees.map((assignee) => (
          <div
            key={assignee.id}
            className="bg-cream-100 border-2 border-cream-400 p-4 space-y-3"
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
                <p className="text-cream-600 text-xs">
                  Joined {new Date(assignee.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
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
        ))}
      </div>
    </div>
  );
}
