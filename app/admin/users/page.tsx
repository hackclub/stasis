'use client';

import { useState, useEffect, useCallback } from 'react';
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
  role: 'ADMIN' | 'REVIEWER' | 'SIDEKICK';
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
  verificationStatus: string | null;
  hasAddress: boolean;
  totalProjects: number;
  totalHoursClaimed: number;
  totalHoursApproved: number;
  hasEventInvite: boolean;
  flightStipend: number;
  shopPurchaseCount: number;
  projects: Project[];
  badges: ProjectBadge[];
  roles: UserRole[];
}

interface UserPurchase {
  id: string;
  itemId: string;
  itemName: string;
  imageUrl: string | null;
  amount: number;
  purchasedAt: string;
}

const AVAILABLE_ROLES: Array<'ADMIN' | 'REVIEWER' | 'SIDEKICK'> = ['ADMIN', 'REVIEWER', 'SIDEKICK'];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFraud, setFilterFraud] = useState<boolean | null>(null);
  const [filterRole, setFilterRole] = useState<'ADMIN' | 'REVIEWER' | 'SIDEKICK' | null>(null);
  const [filterAddress, setFilterAddress] = useState<boolean | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, string[]>>({});
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ message: string; total: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [purchasesModal, setPurchasesModal] = useState<{ user: AdminUser; purchases: UserPurchase[] } | null>(null);
  const [loadingPurchases, setLoadingPurchases] = useState<string | null>(null);

  const openPurchasesModal = useCallback(async (user: AdminUser) => {
    setLoadingPurchases(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/purchases`);
      if (res.ok) {
        const { purchases } = await res.json();
        setPurchasesModal({ user, purchases });
      }
    } catch (error) {
      console.error('Failed to fetch purchases:', error);
    } finally {
      setLoadingPurchases(null);
    }
  }, []);

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

  async function backfillAddresses() {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch('/api/admin/users/backfill-addresses', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBackfillResult({ message: data.message, total: data.total });
      }
    } catch (error) {
      console.error('Failed to backfill addresses:', error);
    } finally {
      setBackfilling(false);
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
      (user.slackId?.toLowerCase().includes(query)) ||
      user.id.toLowerCase().includes(query)
    );
    const matchesFraud = filterFraud === null || user.fraudConvicted === filterFraud;
    const matchesRole = filterRole === null || user.roles?.some(r => r.role === filterRole);
    const matchesAddress = filterAddress === null || user.hasAddress === filterAddress;
    return matchesSearch && matchesFraud && matchesRole && matchesAddress;
  });

  const hasRole = (user: AdminUser, role: 'ADMIN' | 'REVIEWER' | 'SIDEKICK') =>
    user.roles?.some(r => r.role === role) ?? false;

  const getRoleInfo = (user: AdminUser, role: 'ADMIN' | 'REVIEWER' | 'SIDEKICK') =>
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

  const togglePendingRole = (user: AdminUser, role: 'ADMIN' | 'REVIEWER' | 'SIDEKICK') => {
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
              <p className="text-brown-800 text-sm uppercase">
                {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
              </p>
              <input
                type="text"
                placeholder="Search by name, email, or Slack ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-cream-100 border-2 border-cream-400 px-4 py-2 text-brown-800 placeholder-cream-600 focus:border-orange-500 focus:outline-none w-full sm:w-80"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterFraud(filterFraud === true ? null : true)}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterFraud === true
                    ? 'bg-red-600 text-white led-flicker'
                    : 'bg-cream-100 border border-cream-400 text-brown-800 hover:border-cream-500'
                }`}
              >
                Fraud
              </button>
              <button
                onClick={() => setFilterFraud(filterFraud === false ? null : false)}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterFraud === false
                    ? 'bg-green-600 text-white led-flicker'
                    : 'bg-cream-100 border border-cream-400 text-brown-800 hover:border-cream-500'
                }`}
              >
                No Fraud
              </button>
              <span className="text-cream-400">|</span>
              <button
                onClick={() => setFilterRole(filterRole === 'ADMIN' ? null : 'ADMIN')}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterRole === 'ADMIN'
                    ? 'bg-orange-500 text-brown-800 led-flicker'
                    : 'bg-cream-100 border border-cream-400 text-brown-800 hover:border-cream-500'
                }`}
              >
                Admin Role
              </button>
              <button
                onClick={() => setFilterRole(filterRole === 'REVIEWER' ? null : 'REVIEWER')}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterRole === 'REVIEWER'
                    ? 'bg-blue-600 text-white led-flicker'
                    : 'bg-cream-100 border border-cream-400 text-brown-800 hover:border-cream-500'
                }`}
              >
                Reviewer Role
              </button>
              <button
                onClick={() => setFilterRole(filterRole === 'SIDEKICK' ? null : 'SIDEKICK')}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterRole === 'SIDEKICK'
                    ? 'bg-purple-600 text-white led-flicker'
                    : 'bg-cream-100 border border-cream-400 text-cream-800 hover:border-cream-500'
                }`}
              >
                Sidekick Role
              </button>
              <span className="text-cream-400">|</span>
              <button
                onClick={() => setFilterAddress(filterAddress === true ? null : true)}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterAddress === true
                    ? 'bg-green-600 text-white led-flicker'
                    : 'bg-cream-100 border border-cream-400 text-brown-800 hover:border-cream-500'
                }`}
              >
                Has Address
              </button>
              <button
                onClick={() => setFilterAddress(filterAddress === false ? null : false)}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterAddress === false
                    ? 'bg-red-600 text-white led-flicker'
                    : 'bg-cream-100 border border-cream-400 text-brown-800 hover:border-cream-500'
                }`}
              >
                No Address
              </button>
              <span className="text-cream-400">|</span>
              <button
                onClick={() => {
                  if (confirm('Backfill address data from Hack Club Auth for all users missing addresses?')) {
                    backfillAddresses();
                  }
                }}
                disabled={backfilling}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  backfilling
                    ? 'bg-cream-300 text-brown-800 opacity-50'
                    : 'bg-orange-500 text-brown-800 hover:bg-orange-400'
                } transition-colors`}
              >
                {backfilling ? 'Backfilling...' : 'Backfill Addresses'}
              </button>
              {backfillResult && (
                <span className="text-xs text-brown-800 self-center">
                  {backfillResult.message} ({backfillResult.total} users) — check server logs for progress
                </span>
              )}
              {(filterFraud !== null || filterRole !== null || filterAddress !== null) && (
                <button
                  onClick={() => { setFilterFraud(null); setFilterRole(null); setFilterAddress(null); }}
                  className="px-3 py-1.5 text-xs uppercase text-brown-800 hover:text-orange-500 transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Users List */}
          {loading ? (
            <div className="text-center py-8">
              <p className="text-brown-800">Loading users...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
              <p className="text-brown-800">No users found</p>
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
                            className="w-10 h-10 flex-shrink-0 border-2 border-orange-500"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-cream-400 flex items-center justify-center flex-shrink-0 border-2 border-orange-500">
                            <span className="text-brown-800 text-sm">
                              {(user.name || user.email)[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-brown-800 truncate">
                              {user.name || user.email}
                            </p>
                            {hasRole(user, 'ADMIN') && (
                              <span className="text-xs bg-orange-500 text-brown-800 px-2 py-0.5 uppercase">
                                Admin
                              </span>
                            )}
                            {hasRole(user, 'REVIEWER') && (
                              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 uppercase">
                                Reviewer
                              </span>
                            )}
                            {hasRole(user, 'SIDEKICK') && (
                              <span className="text-xs bg-purple-600 text-white px-2 py-0.5 uppercase">
                                Sidekick
                              </span>
                            )}
                            {user.fraudConvicted && (
                              <span className="text-xs bg-red-600 text-white px-2 py-0.5 uppercase">
                                Fraud
                              </span>
                            )}
                            {user.hasAddress ? (
                              <span className="text-xs bg-green-600 text-white px-2 py-0.5 uppercase">
                                Address
                              </span>
                            ) : (
                              <span className="text-xs bg-red-600/80 text-white px-2 py-0.5 uppercase">
                                No Address
                              </span>
                            )}
                            {user.verificationStatus === 'verified' ? (
                              <span className="text-xs bg-green-600 text-white px-2 py-0.5 uppercase">
                                IDV Verified
                              </span>
                            ) : (
                              <span className="text-xs bg-yellow-600 text-white px-2 py-0.5 uppercase">
                                IDV {user.verificationStatus || 'Unknown'}
                              </span>
                            )}
                          </div>
                          <p className="text-brown-800 text-sm truncate">
                            {user.email}
                            <span className="text-cream-500 mx-1">·</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(user.id);
                                setCopiedId(user.id);
                                setTimeout(() => setCopiedId(prev => prev === user.id ? null : prev), 2000);
                              }}
                              className="ml-2 text-cream-600 hover:text-orange-500 transition-colors cursor-pointer"
                              title="Copy CUID"
                            >
                              {copiedId === user.id ? 'Copied!' : user.id}
                            </button>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 flex-shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-orange-500">{user.totalProjects} {user.totalProjects === 1 ? 'project' : 'projects'}</p>
                          <p className="text-brown-800 text-xs">
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
                          className={`text-brown-800 transition-transform ${expandedUser === user.id ? 'rotate-180' : ''}`}
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
                          <p className="text-brown-800">{user.email}</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Slack ID</p>
                          <p className="text-brown-800">{user.slackId || '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Joined</p>
                          <p className="text-brown-800">
                            {new Date(user.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Hours Logged</p>
                          <p className="text-brown-800">{user.totalHoursClaimed.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Hours Approved</p>
                          <p className="text-brown-800">{user.totalHoursApproved.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Projects</p>
                          <p className="text-brown-800">{user.totalProjects}</p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">ID Verification</p>
                          <p className={user.verificationStatus === 'verified' ? 'text-green-600' : 'text-yellow-600'}>
                            {user.verificationStatus || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Event Invite</p>
                          <p className={user.hasEventInvite ? 'text-green-600' : 'text-brown-800'}>
                            {user.hasEventInvite ? 'Purchased ✓' : 'No'}
                          </p>
                        </div>
                        <div>
                          <p className="text-cream-600 uppercase text-xs mb-1">Flight Stipend</p>
                          <p className="text-brown-800">${user.flightStipend.toLocaleString()}</p>
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
                                    ? 'bg-orange-500/20 text-orange-500 border border-orange-500/50' 
                                    : 'bg-cream-200 text-brown-800 border border-cream-400'
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
                                    <span className="text-brown-800 text-sm">{project.title}</span>
                                    <div className="flex gap-2">
                                      <span className={`text-xs uppercase ${
                                        project.designStatus === 'approved' ? 'text-green-600' :
                                        project.designStatus === 'rejected' ? 'text-red-600' :
                                        project.designStatus === 'in_review' ? 'text-orange-500' :
                                        'text-brown-800'
                                      }`}>
                                        D: {project.designStatus.replace('_', ' ')}
                                      </span>
                                      <span className={`text-xs uppercase ${
                                        project.buildStatus === 'approved' ? 'text-green-600' :
                                        project.buildStatus === 'rejected' ? 'text-red-600' :
                                        project.buildStatus === 'in_review' ? 'text-orange-500' :
                                        'text-brown-800'
                                      }`}>
                                        B: {project.buildStatus.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-brown-800">
                                    <span>{project.workSessions.length} session{project.workSessions.length !== 1 ? 's' : ''}</span>
                                    <span>•</span>
                                    <span>{hoursClaimed.toFixed(1)}h logged</span>
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
                                              ? 'bg-orange-500/20 text-orange-500 border border-orange-500/50' 
                                              : 'bg-cream-100 text-brown-800 border border-cream-400'
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
                                  className="mt-0.5 accent-orange-500"
                                />
                                <div>
                                  <span className={`text-sm ${
                                    role === 'ADMIN' ? 'text-orange-500' : role === 'SIDEKICK' ? 'text-purple-600' : 'text-blue-600'
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
                              className="px-3 py-1.5 text-xs uppercase bg-orange-500 text-brown-800 hover:bg-orange-400 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {updating === user.id ? 'Saving...' : 'Save Roles'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelRoleChanges(user.id);
                              }}
                              disabled={updating === user.id}
                              className="px-3 py-1.5 text-xs uppercase bg-cream-300 text-brown-800 hover:bg-cream-400 transition-colors cursor-pointer disabled:opacity-50"
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPurchasesModal(user);
                          }}
                          disabled={user.shopPurchaseCount === 0 || loadingPurchases === user.id}
                          className={`px-4 py-2 text-sm uppercase transition-colors cursor-pointer ${
                            user.shopPurchaseCount === 0
                              ? 'bg-cream-300 text-cream-500 cursor-not-allowed'
                              : 'bg-orange-500 text-brown-800 hover:bg-orange-400'
                          } disabled:opacity-50`}
                        >
                          {loadingPurchases === user.id
                            ? 'Loading...'
                            : user.shopPurchaseCount === 0
                              ? 'No Purchases'
                              : `View ${user.shopPurchaseCount} Purchase${user.shopPurchaseCount !== 1 ? 's' : ''}`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Purchases Modal */}
          {purchasesModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => setPurchasesModal(null)} />
              <div className="relative bg-cream-100 border-2 border-brown-800 p-6 max-w-lg w-full mx-4 shadow-lg max-h-[80vh] flex flex-col">
                <button
                  onClick={() => setPurchasesModal(null)}
                  className="absolute -top-4 -right-4 w-10 h-10 flex items-center justify-center bg-cream-100 border border-cream-600 text-brown-800 hover:text-orange-500 text-lg leading-none cursor-pointer transition-colors"
                >
                  &times;
                </button>

                <h2 className="text-lg uppercase tracking-wide mb-1 text-brown-800">
                  Purchases
                </h2>
                <p className="text-cream-600 text-sm mb-4">
                  {purchasesModal.user.name || purchasesModal.user.email}
                </p>

                {purchasesModal.purchases.length === 0 ? (
                  <p className="text-cream-500 text-sm text-center py-4">No purchases found.</p>
                ) : (
                  <div className="overflow-y-auto overflow-x-auto flex-1 -mx-6 px-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-cream-400">
                          <th className="text-left text-brown-800 text-xs uppercase px-3 py-2">Item</th>
                          <th className="text-right text-brown-800 text-xs uppercase px-3 py-2">Bits</th>
                          <th className="text-right text-brown-800 text-xs uppercase px-3 py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchasesModal.purchases.map((purchase) => (
                          <tr key={purchase.id} className="border-b border-cream-300 last:border-b-0">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {purchase.imageUrl && (
                                  <img src={purchase.imageUrl} alt="" className="w-6 h-6 object-contain border border-cream-400 flex-shrink-0" />
                                )}
                                <span className="text-brown-800">{purchase.itemName}</span>
                              </div>
                            </td>
                            <td className="text-right px-3 py-2 text-orange-400 font-mono">
                              {purchase.amount.toLocaleString()}
                            </td>
                            <td className="text-right px-3 py-2 text-brown-800 whitespace-nowrap">
                              {new Date(purchase.purchasedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
    </>
  );
}
