'use client';

import { useState, useEffect } from 'react';
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

interface UserRole {
  id: string;
  role: 'ADMIN' | 'REVIEWER';
  grantedAt: string;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  fraudConvicted: boolean;
  slackId: string | null;
  totalProjects: number;
  totalHoursClaimed: number;
  totalHoursApproved: number;
  projects: Project[];
  badges: ProjectBadge[];
  roles: UserRole[];
}

const AVAILABLE_ROLES: Array<'ADMIN' | 'REVIEWER'> = ['ADMIN', 'REVIEWER'];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFraud, setFilterFraud] = useState<boolean | null>(null);
  const [filterRole, setFilterRole] = useState<'ADMIN' | 'REVIEWER' | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, string[]>>({});

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

  async function updateUser(userId: string, data: { fraudConvicted?: boolean; roles?: string[] }) {
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updatedUser = await res.json();
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, roles: updatedUser.roles ?? u.roles, fraudConvicted: data.fraudConvicted ?? u.fraudConvicted } : u
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
    const matchesFraud = filterFraud === null || user.fraudConvicted === filterFraud;
    const matchesRole = filterRole === null || user.roles?.some(r => r.role === filterRole);
    return matchesSearch && matchesFraud && matchesRole;
  });

  const hasRole = (user: AdminUser, role: 'ADMIN' | 'REVIEWER') => 
    user.roles?.some(r => r.role === role) ?? false;

  const getRoleInfo = (user: AdminUser, role: 'ADMIN' | 'REVIEWER') =>
    user.roles?.find(r => r.role === role);

  const getPendingRoles = (user: AdminUser): string[] => {
    if (pendingRoles[user.id] !== undefined) {
      return pendingRoles[user.id];
    }
    return user.roles?.map(r => r.role) ?? [];
  };

  const hasPendingRole = (user: AdminUser, role: string): boolean => {
    return getPendingRoles(user).includes(role);
  };

  const togglePendingRole = (user: AdminUser, role: 'ADMIN' | 'REVIEWER') => {
    setPendingRoles(prev => {
      const currentPending = prev[user.id];
      const current = currentPending !== undefined 
        ? currentPending 
        : (user.roles?.map(r => r.role) ?? []);
      const newRoles = current.includes(role)
        ? current.filter(r => r !== role)
        : [...current, role];
      return { ...prev, [user.id]: newRoles };
    });
  };

  const hasPendingChanges = (user: AdminUser): boolean => {
    if (pendingRoles[user.id] === undefined) return false;
    const currentRoles = user.roles?.map(r => r.role) ?? [];
    const pending = pendingRoles[user.id];
    return JSON.stringify([...currentRoles].sort()) !== JSON.stringify([...pending].sort());
  };

  const saveRoles = async (user: AdminUser) => {
    const roles = pendingRoles[user.id];
    if (roles === undefined) return;
    await updateUser(user.id, { roles });
    setPendingRoles(prev => {
      const next = { ...prev };
      delete next[user.id];
      return next;
    });
  };

  const cancelRoleChanges = (userId: string) => {
    setPendingRoles(prev => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

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
          {/* Search & Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <p className="text-cream-700 text-sm uppercase">
                {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
              </p>
              <input
                type="text"
                placeholder="Search by name, email, or Slack ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-cream-100 border-2 border-cream-400 px-4 py-2 text-cream-800 placeholder-cream-600 focus:border-brand-500 focus:outline-none w-full sm:w-80"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterFraud(filterFraud === true ? null : true)}
                className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
                  filterFraud === true
                    ? 'bg-red-600 text-white'
                    : 'bg-cream-100 border border-cream-400 text-cream-800 hover:border-cream-500'
                }`}
              >
                Fraud
              </button>
              <button
                onClick={() => setFilterFraud(filterFraud === false ? null : false)}
                className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
                  filterFraud === false
                    ? 'bg-green-600 text-white'
                    : 'bg-cream-100 border border-cream-400 text-cream-800 hover:border-cream-500'
                }`}
              >
                No Fraud
              </button>
              <span className="text-cream-400">|</span>
              <button
                onClick={() => setFilterRole(filterRole === 'ADMIN' ? null : 'ADMIN')}
                className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
                  filterRole === 'ADMIN'
                    ? 'bg-brand-500 text-cream-950'
                    : 'bg-cream-100 border border-cream-400 text-cream-800 hover:border-cream-500'
                }`}
              >
                Admin Role
              </button>
              <button
                onClick={() => setFilterRole(filterRole === 'REVIEWER' ? null : 'REVIEWER')}
                className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
                  filterRole === 'REVIEWER'
                    ? 'bg-blue-600 text-white'
                    : 'bg-cream-100 border border-cream-400 text-cream-800 hover:border-cream-500'
                }`}
              >
                Reviewer Role
              </button>
              {(filterFraud !== null || filterRole !== null) && (
                <button
                  onClick={() => { setFilterFraud(null); setFilterRole(null); }}
                  className="px-3 py-1.5 text-xs uppercase text-cream-700 hover:text-brand-500 transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Users List */}
          {loading ? (
            <div className="text-center py-8">
              <p className="text-cream-700">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
              <p className="text-cream-700">No users found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="bg-cream-100 border-2 border-cream-400"
                >
                  {/* User Row */}
                  <div 
                    className="p-4 cursor-pointer hover:bg-cream-200 transition-colors"
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
                          <div className="w-10 h-10 rounded-full bg-cream-400 flex items-center justify-center flex-shrink-0">
                            <span className="text-cream-800 text-sm">
                              {(user.name || user.email)[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-cream-800 truncate">
                              {user.name || user.email}
                            </p>
                            {hasRole(user, 'ADMIN') && (
                              <span className="text-xs bg-brand-500 text-cream-950 px-2 py-0.5 uppercase">
                                Admin
                              </span>
                            )}
                            {hasRole(user, 'REVIEWER') && (
                              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 uppercase">
                                Reviewer
                              </span>
                            )}
                            {user.fraudConvicted && (
                              <span className="text-xs bg-red-600 text-white px-2 py-0.5 uppercase">
                                Fraud
                              </span>
                            )}
                          </div>
                          <p className="text-cream-700 text-sm truncate">{user.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-brand-500">{user.totalProjects} projects</p>
                          <p className="text-cream-700 text-xs">
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
                          className={`text-cream-700 transition-transform ${expandedUser === user.id ? 'rotate-180' : ''}`}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedUser === user.id && (
                    <div className="border-t border-cream-400 p-4 space-y-4">
                      {/* User Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Email</p>
                          <p className="text-cream-700">{user.email}</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Slack ID</p>
                          <p className="text-cream-700">{user.slackId || '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Joined</p>
                          <p className="text-cream-700">
                            {new Date(user.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Hours Claimed</p>
                          <p className="text-cream-700">{user.totalHoursClaimed.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Hours Approved</p>
                          <p className="text-cream-700">{user.totalHoursApproved.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Projects</p>
                          <p className="text-cream-700">{user.totalProjects}</p>
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
                                    ? 'bg-brand-500/20 text-brand-500 border border-brand-500/50' 
                                    : 'bg-cream-200 text-cream-700 border border-cream-400'
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
                                  className="block bg-cream-200 hover:bg-cream-300 px-3 py-2 transition-colors"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-cream-800 text-sm">{project.title}</span>
                                    <div className="flex gap-2">
                                      <span className={`text-xs uppercase ${
                                        project.designStatus === 'approved' ? 'text-green-600' :
                                        project.designStatus === 'rejected' ? 'text-red-600' :
                                        project.designStatus === 'in_review' ? 'text-brand-500' :
                                        'text-cream-700'
                                      }`}>
                                        D: {project.designStatus.replace('_', ' ')}
                                      </span>
                                      <span className={`text-xs uppercase ${
                                        project.buildStatus === 'approved' ? 'text-green-600' :
                                        project.buildStatus === 'rejected' ? 'text-red-600' :
                                        project.buildStatus === 'in_review' ? 'text-brand-500' :
                                        'text-cream-700'
                                      }`}>
                                        B: {project.buildStatus.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-cream-700">
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
                                              ? 'bg-brand-500/20 text-brand-500 border border-brand-500/50' 
                                              : 'bg-cream-100 text-cream-700 border border-cream-400'
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

                      {/* Roles Management */}
                      <div>
                        <p className="text-cream-600 uppercase text-xs mb-2">Roles</p>
                        <div className="flex flex-wrap gap-4 mb-3">
                          {AVAILABLE_ROLES.map((role) => {
                            const roleInfo = getRoleInfo(user, role);
                            const checked = hasPendingRole(user, role);
                            return (
                              <label
                                key={role}
                                className="flex items-start gap-2 cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    togglePendingRole(user, role);
                                  }}
                                  disabled={updating === user.id}
                                  className="mt-0.5 accent-brand-500"
                                />
                                <div>
                                  <span className={`text-sm ${
                                    role === 'ADMIN' ? 'text-brand-500' : 'text-blue-600'
                                  }`}>
                                    {role}
                                  </span>
                                  {roleInfo && !hasPendingChanges(user) && (
                                    <p className="text-xs text-cream-600">
                                      Granted {new Date(roleInfo.grantedAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                      })}
                                    </p>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        {hasPendingChanges(user) && (
                          <div className="flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveRoles(user);
                              }}
                              disabled={updating === user.id}
                              className="px-3 py-1.5 text-xs uppercase bg-brand-500 text-cream-950 hover:bg-brand-400 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {updating === user.id ? 'Saving...' : 'Save Roles'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelRoleChanges(user.id);
                              }}
                              disabled={updating === user.id}
                              className="px-3 py-1.5 text-xs uppercase bg-cream-300 text-cream-700 hover:bg-cream-400 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-3 pt-2 border-t border-cream-400">
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
    </>
  );
}
