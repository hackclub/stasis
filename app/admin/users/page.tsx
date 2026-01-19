'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from "@/lib/auth-client";
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
import Link from 'next/link';

interface ProjectBadge {
  id: string;
  badge: string;
  grantedAt: string | null;
}

interface WorkSession {
  id: string;
  hoursClaimed: number;
  hoursApproved: number | null;
}

interface Project {
  id: string;
  title: string;
  designStatus: string;
  buildStatus: string;
  workSessions: WorkSession[];
  badges: ProjectBadge[];
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  isAdmin: boolean;
  fraudConvicted: boolean;
  slackId: string | null;
  totalProjects: number;
  totalHoursClaimed: number;
  totalHoursApproved: number;
  projects: Project[];
  badges: ProjectBadge[];
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAdmin, setFilterAdmin] = useState<boolean | null>(null);
  const [filterFraud, setFilterFraud] = useState<boolean | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateUser(userId: string, data: { isAdmin?: boolean; fraudConvicted?: boolean }) {
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, ...data } : u
        ));
      }
    } catch (error) {
      console.error('Failed to update user:', error);
    } finally {
      setUpdating(null);
    }
  }

  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      user.email.toLowerCase().includes(query) ||
      (user.name?.toLowerCase().includes(query)) ||
      (user.slackId?.toLowerCase().includes(query))
    );
    const matchesAdmin = filterAdmin === null || user.isAdmin === filterAdmin;
    const matchesFraud = filterFraud === null || user.fraudConvicted === filterFraud;
    return matchesSearch && matchesAdmin && matchesFraud;
  });

  const getUniqueBadges = (badges: ProjectBadge[]) => {
    const unique = new Map<string, ProjectBadge>();
    badges.forEach(b => {
      if (!unique.has(b.badge) || b.grantedAt) {
        unique.set(b.badge, b);
      }
    });
    return Array.from(unique.values());
  };

  return (
    <>
      <div className="min-h-screen bg-cream-950 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-cream-300 hover:text-brand-500 transition-colors">
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-brand-500 text-xl uppercase tracking-wide">User Management</h1>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-cream-300 text-sm hidden sm:block">
              {session?.user.name || session?.user.email}
            </span>
            <button
              onClick={() => signOut()}
              className="text-cream-300 hover:text-brand-500 text-sm uppercase transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Search & Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <p className="text-cream-300 text-sm uppercase">
                {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
              </p>
              <input
                type="text"
                placeholder="Search by name, email, or Slack ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-cream-900 border-2 border-cream-700 px-4 py-2 text-cream-100 placeholder-cream-600 focus:border-brand-500 focus:outline-none w-full sm:w-80"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterAdmin(filterAdmin === true ? null : true)}
                className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
                  filterAdmin === true
                    ? 'bg-brand-500 text-cream-950'
                    : 'bg-cream-900 border border-cream-700 text-cream-200 hover:border-cream-500'
                }`}
              >
                Admins
              </button>
              <button
                onClick={() => setFilterAdmin(filterAdmin === false ? null : false)}
                className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
                  filterAdmin === false
                    ? 'bg-cream-700 text-cream-100'
                    : 'bg-cream-900 border border-cream-700 text-cream-200 hover:border-cream-500'
                }`}
              >
                Non-Admins
              </button>
              <button
                onClick={() => setFilterFraud(filterFraud === true ? null : true)}
                className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
                  filterFraud === true
                    ? 'bg-red-600 text-white'
                    : 'bg-cream-900 border border-cream-700 text-cream-200 hover:border-cream-500'
                }`}
              >
                Fraud
              </button>
              <button
                onClick={() => setFilterFraud(filterFraud === false ? null : false)}
                className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
                  filterFraud === false
                    ? 'bg-green-600 text-white'
                    : 'bg-cream-900 border border-cream-700 text-cream-200 hover:border-cream-500'
                }`}
              >
                No Fraud
              </button>
              {(filterAdmin !== null || filterFraud !== null) && (
                <button
                  onClick={() => { setFilterAdmin(null); setFilterFraud(null); }}
                  className="px-3 py-1.5 text-xs uppercase text-cream-300 hover:text-cream-300 transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Users List */}
          {loading ? (
            <div className="text-center py-8">
              <p className="text-cream-300">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-cream-900 border-2 border-cream-700 p-8 text-center">
              <p className="text-cream-300">No users found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-cream-900 border-2 border-cream-700"
                >
                  {/* User Row */}
                  <div 
                    className="p-4 cursor-pointer hover:bg-cream-800 transition-colors"
                    onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        {user.image ? (
                          <img 
                            src={user.image} 
                            alt="" 
                            className="w-10 h-10 rounded-full flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-cream-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-cream-200 text-sm">
                              {(user.name || user.email)[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-cream-100 truncate">
                              {user.name || user.email}
                            </p>
                            {user.isAdmin && (
                              <span className="text-xs bg-brand-500 text-cream-950 px-2 py-0.5 uppercase">
                                Admin
                              </span>
                            )}
                            {user.fraudConvicted && (
                              <span className="text-xs bg-red-600 text-white px-2 py-0.5 uppercase">
                                Fraud
                              </span>
                            )}
                          </div>
                          <p className="text-cream-300 text-sm truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-brand-500">{user.totalProjects} projects</p>
                          <p className="text-cream-300 text-xs">
                            {user.totalHoursApproved.toFixed(1)}h approved
                          </p>
                        </div>
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          width="20" 
                          height="20" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2"
                          className={`text-cream-300 transition-transform ${expandedUser === user.id ? 'rotate-180' : ''}`}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedUser === user.id && (
                    <div className="border-t border-cream-700 p-4 space-y-4">
                      {/* User Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Email</p>
                          <p className="text-cream-300">{user.email}</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Slack ID</p>
                          <p className="text-cream-300">{user.slackId || '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Joined</p>
                          <p className="text-cream-300">
                            {new Date(user.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Hours Claimed</p>
                          <p className="text-cream-300">{user.totalHoursClaimed.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Hours Approved</p>
                          <p className="text-cream-300">{user.totalHoursApproved.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Projects</p>
                          <p className="text-cream-300">{user.totalProjects}</p>
                        </div>
                      </div>

                      {/* Badges */}
                      {user.badges.length > 0 && (
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-2">Badges</p>
                          <div className="flex flex-wrap gap-2">
                            {getUniqueBadges(user.badges).map((badge) => (
                              <span
                                key={badge.id}
                                className={`text-xs px-2 py-1 ${
                                  badge.grantedAt 
                                    ? 'bg-brand-500/20 text-brand-400 border border-brand-500/50' 
                                    : 'bg-cream-800 text-cream-300 border border-cream-700'
                                }`}
                              >
                                {badge.badge.replace(/_/g, ' ')}
                                {badge.grantedAt && ' ✓'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Projects */}
                      {user.projects.length > 0 && (
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-2">Projects</p>
                          <div className="space-y-2">
                            {user.projects.map((project) => {
                              const hoursClaimed = project.workSessions.reduce((a, s) => a + s.hoursClaimed, 0);
                              const hoursApproved = project.workSessions.reduce((a, s) => a + (s.hoursApproved ?? 0), 0);
                              return (
                                <Link
                                  key={project.id}
                                  href={`/admin/projects/${project.id}`}
                                  className="block bg-cream-800 hover:bg-cream-700 px-3 py-2 transition-colors"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-cream-200 text-sm">{project.title}</span>
                                    <div className="flex gap-2">
                                      <span className={`text-xs uppercase ${
                                        project.designStatus === 'approved' ? 'text-green-500' :
                                        project.designStatus === 'rejected' ? 'text-red-500' :
                                        project.designStatus === 'in_review' ? 'text-brand-500' :
                                        'text-cream-300'
                                      }`}>
                                        D: {project.designStatus.replace('_', ' ')}
                                      </span>
                                      <span className={`text-xs uppercase ${
                                        project.buildStatus === 'approved' ? 'text-green-500' :
                                        project.buildStatus === 'rejected' ? 'text-red-500' :
                                        project.buildStatus === 'in_review' ? 'text-brand-500' :
                                        'text-cream-300'
                                      }`}>
                                        B: {project.buildStatus.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-cream-300">
                                    <span>{project.workSessions.length} session{project.workSessions.length !== 1 ? 's' : ''}</span>
                                    <span>•</span>
                                    <span>{hoursClaimed.toFixed(1)}h claimed</span>
                                    <span>•</span>
                                    <span>{hoursApproved.toFixed(1)}h approved</span>
                                  </div>
                                  {project.badges.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {project.badges.map((badge) => (
                                        <span
                                          key={badge.id}
                                          className={`text-xs px-1.5 py-0.5 ${
                                            badge.grantedAt 
                                              ? 'bg-brand-500/20 text-brand-400 border border-brand-500/50' 
                                              : 'bg-cream-900 text-cream-300 border border-cream-700'
                                          }`}
                                        >
                                          {badge.badge.replace(/_/g, ' ')}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-3 pt-2 border-t border-cream-800">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const action = user.isAdmin ? 'remove admin from' : 'make admin';
                            if (confirm(`Are you sure you want to ${action} ${user.name || user.email}?`)) {
                              updateUser(user.id, { isAdmin: !user.isAdmin });
                            }
                          }}
                          disabled={updating === user.id}
                          className={`px-4 py-2 text-sm uppercase transition-colors cursor-pointer ${
                            user.isAdmin
                              ? 'bg-cream-800 text-cream-300 hover:bg-cream-700'
                              : 'bg-brand-500 text-cream-950 hover:bg-brand-400'
                          } disabled:opacity-50`}
                        >
                          {updating === user.id ? '...' : user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const action = user.fraudConvicted ? 'clear fraud flag from' : 'mark as fraud';
                            if (confirm(`Are you sure you want to ${action} ${user.name || user.email}?`)) {
                              updateUser(user.id, { fraudConvicted: !user.fraudConvicted });
                            }
                          }}
                          disabled={updating === user.id}
                          className={`px-4 py-2 text-sm uppercase transition-colors cursor-pointer ${
                            user.fraudConvicted
                              ? 'bg-green-600 text-white hover:bg-green-500'
                              : 'bg-red-600 text-white hover:bg-red-500'
                          } disabled:opacity-50`}
                        >
                          {updating === user.id ? '...' : user.fraudConvicted ? 'Clear Fraud Flag' : 'Mark as Fraud'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <NoiseOverlay />
    </>
  );
}
