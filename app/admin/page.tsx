'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ProjectUser {
  id: string;
  name: string | null;
  email: string;
}

interface WorkSession {
  id: string;
  hoursClaimed: number;
  hoursApproved: number | null;
}

interface AdminProject {
  id: string;
  title: string;
  description: string | null;
  status: string;
  submittedAt: string | null;
  submissionNotes: string | null;
  user: ProjectUser;
  workSessions: WorkSession[];
}

export default function AdminDashboard() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/admin/projects');
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        }
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();
  }, []);

  const getTotalHours = (sessions: WorkSession[]) => {
    return sessions.reduce((acc, s) => acc + s.hoursClaimed, 0);
  };

  return (
    <>
          {/* Stats */}
          <div className="mb-6">
            <p className="text-brown-800 text-sm uppercase">
              {projects.length} project{projects.length !== 1 ? 's' : ''} awaiting review
            </p>
          </div>

          {/* Projects List */}
          {loading ? (
            <div className="text-center py-8">
              <p className="text-brown-800">Loading projects...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
              <p className="text-brown-800">No projects in review</p>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/admin/projects/${project.id}`}
                  className="block bg-cream-100 border-2 border-cream-400 hover:border-orange-500 p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-brown-800 text-lg uppercase tracking-wide truncate">
                        {project.title}
                      </h2>
                      <p className="text-brown-800 text-sm mt-1">
                        {project.user.name || project.user.email}
                        {project.user.name && (
                          <span className="text-cream-600"> ({project.user.email})</span>
                        )}
                      </p>
                      {project.description && (
                        <p className="text-brown-800 text-sm mt-2 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                      {project.submissionNotes && (
                        <div className="mt-3 bg-cream-200 border border-cream-400 p-3">
                          <p className="text-brown-800 text-xs uppercase mb-1">Submission Notes</p>
                          <p className="text-brown-800 text-sm">{project.submissionNotes}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-orange-500 text-lg">
                        {getTotalHours(project.workSessions).toFixed(1)}h
                      </p>
                      <p className="text-brown-800 text-xs uppercase">claimed</p>
                      {project.submittedAt && (
                        <p className="text-cream-600 text-xs mt-2">
                          {new Date(project.submittedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-brown-800 text-sm">
                    <span>{project.workSessions.length} session{project.workSessions.length !== 1 ? 's' : ''}</span>
                    <span className="text-cream-500">•</span>
                    <span className="text-orange-400">Review →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
    </>
  );
}
