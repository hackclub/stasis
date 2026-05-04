'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { GOAL_LABELS, type GoalPreference, getTierById } from '@/lib/tiers';
import { totalBomCost } from '@/lib/format';
import { ConfirmModal } from '@/app/components/ConfirmModal';

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

interface BOMItemSummary {
  totalCost: number;
  status: string;
}

interface Project {
  id: string;
  title: string;
  tier: number | null;
  bitsAwarded: number | null;
  bomTax: number | null;
  bomShipping: number | null;
  noBomNeeded: boolean;
  designStatus: string;
  buildStatus: string;
  workSessions: WorkSession[];
  badges: ProjectBadge[];
  bomItems: BOMItemSummary[];
}

interface UserRole {
  id: string;
  role: 'ADMIN' | 'REVIEWER' | 'SIDEKICK' | 'AUDITOR' | 'AUDITOR';
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
  pronouns: string | null;
  eventPreference: string | null;
  utmSource: string | null;
  signupPage: string | null;
  hasAddress: boolean;
  addressState: string | null;
  addressCountry: string | null;
  totalProjects: number;
  totalHoursClaimed: number;
  totalHoursApproved: number;
  designBits: number;
  totalBits: number;
  attendRegistered: boolean;
  shopTicketPurchased: boolean;
  flightStipend: number;
  shopPurchaseCount: number;
  projects: Project[];
  badges: ProjectBadge[];
  roles: UserRole[];
}

interface UsersResponse {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UserPurchase {
  id: string;
  itemId: string;
  itemName: string;
  imageUrl: string | null;
  amount: number;
  purchasedAt: string;
}

const AVAILABLE_ROLES: Array<'ADMIN' | 'REVIEWER' | 'SIDEKICK' | 'AUDITOR' | 'AUDITOR'> = ['ADMIN', 'REVIEWER', 'SIDEKICK', 'AUDITOR'];

const PRONOUN_OPTIONS = [
  { label: 'he/him', value: 'he/him' },
  { label: 'she/her', value: 'she/her' },
  { label: 'they/them', value: 'they/them' },
  { label: 'Other', value: 'other' },
  { label: 'Not Set', value: 'none' },
];

export default function AdminUsersPage() {
  const urlSearchParams = useSearchParams();
  const initialSearch = urlSearchParams.get('search') || '';
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [filterFraud, setFilterFraud] = useState<boolean | null>(null);
  const [filterRole, setFilterRole] = useState<'ADMIN' | 'REVIEWER' | 'SIDEKICK' | 'AUDITOR' | 'AUDITOR' | null>(null);
  const [filterAddress, setFilterAddress] = useState<boolean | null>(null);
  const [filterPronouns, setFilterPronouns] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'bits'>('recent');
  const [page, setPage] = useState(1);
  const [pendingRoles, setPendingRoles] = useState<Record<string, string[]>>({});
  const [roleConfirm, setRoleConfirm] = useState<{ user: AdminUser; adding: string[]; removing: string[] } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ message: string; total: number } | null>(null);
  const [refreshingAvatars, setRefreshingAvatars] = useState(false);
  const [avatarResult, setAvatarResult] = useState<{ cleared: number; toFetch: number } | null>(null);
  const [backfillingInvites, setBackfillingInvites] = useState(false);
  const [inviteBackfillResult, setInviteBackfillResult] = useState<{ message: string; total: number; skipped: number; processing: number } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [purchasesModal, setPurchasesModal] = useState<{ user: AdminUser; purchases: UserPurchase[] } | null>(null);
  const [grantConfirm, setGrantConfirm] = useState<AdminUser | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [loadingPurchases, setLoadingPurchases] = useState<string | null>(null);
  const [grantingInvite, setGrantingInvite] = useState<string | null>(null);

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

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      if (search) params.set('search', search);
      if (filterFraud !== null) params.set('fraud', String(filterFraud));
      if (filterRole) params.set('role', filterRole);
      if (filterAddress !== null) params.set('address', String(filterAddress));
      if (filterPronouns) params.set('pronouns', filterPronouns);
      if (sortBy === 'bits') params.set('sort', 'bits');

      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterFraud, filterRole, filterAddress, filterPronouns, sortBy]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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

  async function refreshAvatars() {
    setRefreshingAvatars(true);
    setAvatarResult(null);
    try {
      const res = await fetch('/api/admin/users/refresh-avatars', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAvatarResult({ cleared: data.cleared, toFetch: data.toFetch });
      }
    } catch (error) {
      console.error('Failed to refresh avatars:', error);
    } finally {
      setRefreshingAvatars(false);
    }
  }

  async function backfillInviteSideEffects() {
    setBackfillingInvites(true);
    setInviteBackfillResult(null);
    try {
      const res = await fetch('/api/admin/shop/backfill-invite-side-effects', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setInviteBackfillResult(data);
      }
    } catch (error) {
      console.error('Failed to backfill invite side effects:', error);
    } finally {
      setBackfillingInvites(false);
    }
  }

  async function performGrant(user: AdminUser) {
    setGrantingInvite(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/grant-invite`, { method: 'POST' });
      if (res.ok) {
        setData(prev => prev ? {
          ...prev,
          items: prev.items.map(u => u.id === user.id ? { ...u, attendRegistered: true } : u),
        } : prev);
      } else {
        const body = await res.json().catch(() => ({}));
        const detail = body.detail ? `\n\nDetail: ${body.detail}` : '';
        setGrantError(`${body.error || res.statusText}${detail}`);
      }
    } catch (error) {
      console.error('Failed to grant invite:', error);
      setGrantError('Network error while granting invite.');
    } finally {
      setGrantingInvite(null);
    }
  }

  async function updateUser(userId: string, updateData: { fraudConvicted?: boolean; roles?: string[] }) {
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (res.ok) {
        const updatedUser = await res.json();
        setData(prev => prev ? {
          ...prev,
          items: prev.items.map(u =>
            u.id === userId ? { ...u, roles: updatedUser.roles ?? u.roles, fraudConvicted: updateData.fraudConvicted ?? u.fraudConvicted } : u
          ),
        } : prev);
      }
    } catch (error) {
      console.error('Failed to update user:', error);
    } finally {
      setUpdating(null);
    }
  }

  const users = data?.items ?? [];

  const hasRole = (user: AdminUser, role: 'ADMIN' | 'REVIEWER' | 'SIDEKICK' | 'AUDITOR') =>
    user.roles?.some(r => r.role === role) ?? false;

  const getRoleInfo = (user: AdminUser, role: 'ADMIN' | 'REVIEWER' | 'SIDEKICK' | 'AUDITOR') =>
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

  const togglePendingRole = (user: AdminUser, role: 'ADMIN' | 'REVIEWER' | 'SIDEKICK' | 'AUDITOR') => {
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

  const saveRoles = (user: AdminUser) => {
    const roles = pendingRoles[user.id];
    if (roles === undefined) return;
    const currentRoles: string[] = user.roles?.map(r => r.role) ?? [];
    const adding = roles.filter(r => !currentRoles.includes(r));
    const removing = currentRoles.filter(r => !roles.includes(r));
    setRoleConfirm({ user, adding, removing });
  };

  const confirmSaveRoles = async () => {
    if (!roleConfirm) return;
    const { user } = roleConfirm;
    const roles = pendingRoles[user.id];
    if (roles === undefined) return;
    setRoleConfirm(null);
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleFilterChange = (setter: (val: typeof filterFraud | typeof filterRole | typeof filterAddress | typeof filterPronouns) => void, currentVal: unknown, newVal: unknown) => {
    setter(currentVal === newVal ? null : newVal as never);
    setPage(1);
  };

  return (
    <>
          {/* Search & Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <p className="text-cream-50 text-sm uppercase">
                {data ? `${data.total} user${data.total !== 1 ? 's' : ''}` : '...'}
              </p>
              <form onSubmit={handleSearch} className="flex gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search by name, email, or Slack ID..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="bg-brown-800 border-2 border-cream-500/20 px-4 py-2 text-cream-50 placeholder-cream-300 focus:border-orange-500 focus:outline-none w-full sm:w-80"
                />
                <button
                  type="submit"
                  className="px-3 py-2 text-xs uppercase border-2 border-orange-500 text-orange-500 hover:bg-orange-500/10 cursor-pointer"
                >
                  Search
                </button>
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                    className="px-3 py-2 text-xs uppercase border-2 border-cream-500/20 text-cream-50 hover:border-orange-500 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </form>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleFilterChange(setFilterFraud as never, filterFraud, true)}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterFraud === true
                    ? 'bg-red-600 text-white led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                }`}
              >
                Fraud
              </button>
              <button
                onClick={() => handleFilterChange(setFilterFraud as never, filterFraud, false)}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterFraud === false
                    ? 'bg-green-600 text-white led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                }`}
              >
                No Fraud
              </button>
              <span className="text-cream-400">|</span>
              <button
                onClick={() => handleFilterChange(setFilterRole as never, filterRole, 'ADMIN')}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterRole === 'ADMIN'
                    ? 'bg-orange-500 text-cream-50 led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                }`}
              >
                Admin Role
              </button>
              <button
                onClick={() => handleFilterChange(setFilterRole as never, filterRole, 'REVIEWER')}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterRole === 'REVIEWER'
                    ? 'bg-blue-600 text-white led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                }`}
              >
                Reviewer Role
              </button>
              <button
                onClick={() => handleFilterChange(setFilterRole as never, filterRole, 'SIDEKICK')}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterRole === 'SIDEKICK'
                    ? 'bg-purple-600 text-white led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-800 hover:border-cream-500'
                }`}
              >
                Sidekick Role
              </button>
              <button
                onClick={() => handleFilterChange(setFilterRole as never, filterRole, 'AUDITOR')}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterRole === 'AUDITOR'
                    ? 'bg-teal-600 text-white led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-800 hover:border-cream-500'
                }`}
              >
                Auditor Role
              </button>
              <span className="text-cream-400">|</span>
              <button
                onClick={() => handleFilterChange(setFilterAddress as never, filterAddress, true)}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterAddress === true
                    ? 'bg-green-600 text-white led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                }`}
              >
                Has Address
              </button>
              <button
                onClick={() => handleFilterChange(setFilterAddress as never, filterAddress, false)}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  filterAddress === false
                    ? 'bg-red-600 text-white led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                }`}
              >
                No Address
              </button>
              <span className="text-cream-400">|</span>
              {PRONOUN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleFilterChange(setFilterPronouns as never, filterPronouns, opt.value)}
                  className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                    filterPronouns === opt.value
                      ? 'bg-teal-600 text-white led-flicker'
                      : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <span className="text-cream-400">|</span>
              <button
                onClick={() => { setSortBy('recent'); setPage(1); }}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  sortBy === 'recent'
                    ? 'bg-orange-500 text-cream-50 led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                }`}
              >
                Recent
              </button>
              <button
                onClick={() => { setSortBy('bits'); setPage(1); }}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  sortBy === 'bits'
                    ? 'bg-orange-500 text-cream-50 led-flicker'
                    : 'bg-brown-800 border border-cream-500/20 text-cream-50 hover:border-cream-500'
                }`}
              >
                Most Bits
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
                    ? 'bg-brown-800 text-cream-50 opacity-50'
                    : 'bg-orange-500 text-cream-50 hover:bg-orange-400'
                } transition-colors`}
              >
                {backfilling ? 'Backfilling...' : 'Backfill Addresses'}
              </button>
              {backfillResult && (
                <span className="text-xs text-cream-50 self-center">
                  {backfillResult.message} ({backfillResult.total} users) — check server logs for progress
                </span>
              )}
              <span className="text-cream-400">|</span>
              <button
                onClick={() => {
                  if (confirm('Refresh all Slack profile pictures? This will clear gravatar URLs and re-fetch from Slack.')) {
                    refreshAvatars();
                  }
                }}
                disabled={refreshingAvatars}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  refreshingAvatars
                    ? 'bg-brown-800 text-cream-50 opacity-50'
                    : 'bg-orange-500 text-cream-50 hover:bg-orange-400'
                } transition-colors`}
              >
                {refreshingAvatars ? 'Refreshing...' : 'Refresh Avatars'}
              </button>
              {avatarResult && (
                <span className="text-xs text-cream-50 self-center">
                  Cleared {avatarResult.cleared} gravatar URLs, fetching {avatarResult.toFetch} avatars — check server logs
                </span>
              )}
              <span className="text-cream-400">|</span>
              <button
                onClick={() => {
                  if (confirm('Retry Attend registration for all paid Stasis ticket purchasers who are not yet on Attend (also resends Loops email). Users already on Attend are skipped.')) {
                    backfillInviteSideEffects();
                  }
                }}
                disabled={backfillingInvites}
                className={`px-3 py-1.5 text-xs uppercase cursor-pointer ${
                  backfillingInvites
                    ? 'bg-brown-800 text-cream-50 opacity-50'
                    : 'bg-orange-500 text-cream-50 hover:bg-orange-400'
                } transition-colors`}
              >
                {backfillingInvites ? 'Backfilling...' : 'Backfill Invite Emails'}
              </button>
              {inviteBackfillResult && (
                <span className="text-xs text-cream-50 self-center">
                  {inviteBackfillResult.message} ({inviteBackfillResult.processing} to process, {inviteBackfillResult.skipped} skipped) — check server logs
                </span>
              )}
              {(filterFraud !== null || filterRole !== null || filterAddress !== null || filterPronouns !== null || sortBy !== 'recent') && (
                <button
                  onClick={() => { setFilterFraud(null); setFilterRole(null); setFilterAddress(null); setFilterPronouns(null); setSortBy('recent'); setPage(1); }}
                  className="px-3 py-1.5 text-xs uppercase text-cream-50 hover:text-orange-500 transition-colors cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Users List */}
          {loading ? (
            <div className="text-center py-8">
              <p className="text-cream-50">Loading users...</p>
            </div>
          ) : !data || users.length === 0 ? (
            <div className="bg-brown-800 border-2 border-cream-500/20 p-8 text-center">
              <p className="text-cream-50">No users found</p>
            </div>
          ) : (
            <>
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="bg-brown-800 border-2 border-cream-500/20"
                >
                  {/* User Row */}
                  <div
                    className="p-4 cursor-pointer hover:bg-cream-500/10 transition-colors"
                    onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <img
                          src={user.image || '/default_slack.png'}
                          alt=""
                          className="w-10 h-10 flex-shrink-0 border-2 border-orange-500"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-cream-50 truncate">
                              {user.name || user.email}
                            </p>
                            {hasRole(user, 'ADMIN') && (
                              <span className="text-xs bg-orange-500 text-cream-50 px-2 py-0.5 uppercase">
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
                            {hasRole(user, 'AUDITOR') && (
                              <span className="text-xs bg-teal-600 text-white px-2 py-0.5 uppercase">
                                Auditor
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
                            {user.eventPreference && (
                              <span className={`text-xs px-2 py-0.5 uppercase ${
                                user.eventPreference === 'stasis' ? 'bg-orange-500 text-white' :
                                user.eventPreference === 'opensauce' ? 'bg-blue-500 text-white' :
                                'bg-yellow-500 text-white'
                              }`}>
                                {GOAL_LABELS[user.eventPreference as GoalPreference] || user.eventPreference}
                              </span>
                            )}
                          </div>
                          <p className="text-cream-50 text-sm truncate">
                            {user.email}
                            <span className="text-cream-200 mx-1">·</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(user.id);
                                setCopiedId(user.id);
                                setTimeout(() => setCopiedId(prev => prev === user.id ? null : prev), 2000);
                              }}
                              className="ml-2 text-cream-200 hover:text-orange-500 transition-colors cursor-pointer"
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
                          <p className="text-cream-50 text-xs">
                            {user.totalHoursApproved.toFixed(1)}h approved
                          </p>
                          <p className="text-cream-50 text-xs">
                            <span className="text-yellow-500">{user.designBits}b design</span>
                            {' / '}
                            <span className="text-green-500">{user.totalBits}b total</span>
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
                          className={`text-cream-50 transition-transform ${expandedUser === user.id ? 'rotate-180' : ''}`}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedUser === user.id && (
                    <div className="border-t border-cream-500/20 p-4 space-y-4">
                      {/* User Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Email</p>
                          <p className="text-cream-50">{user.email}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Slack ID</p>
                          <p className="text-cream-50">{user.slackId || '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Joined</p>
                          <p className="text-cream-50">
                            {new Date(user.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Hours Logged</p>
                          <p className="text-cream-50">{user.totalHoursClaimed.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Hours Approved</p>
                          <p className="text-cream-50">{user.totalHoursApproved.toFixed(1)}h</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Projects</p>
                          <p className="text-cream-50">{user.totalProjects}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">ID Verification</p>
                          <p className={user.verificationStatus === 'verified' ? 'text-green-600' : 'text-yellow-600'}>
                            {user.verificationStatus || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Attend</p>
                          {user.attendRegistered ? (
                            <p className="text-green-600">Yes ✓</p>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="text-cream-50">No</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGrantConfirm(user);
                                }}
                                disabled={grantingInvite === user.id}
                                className="px-2 py-1 text-[10px] uppercase bg-orange-500 text-cream-50 hover:bg-orange-400 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {grantingInvite === user.id ? 'Granting...' : 'Grant'}
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Shop Ticket</p>
                          {user.shopTicketPurchased ? (
                            <p className="text-green-600">Bought ✓</p>
                          ) : (
                            <p className="text-cream-50">No</p>
                          )}
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Flight Stipend</p>
                          <p className="text-cream-50">${user.flightStipend.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Roles</p>
                          <div className="flex flex-col gap-1">
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
                                      role === 'ADMIN' ? 'text-orange-500' : role === 'SIDEKICK' ? 'text-purple-600' : role === 'AUDITOR' ? 'text-teal-600' : 'text-blue-600'
                                    }`}>
                                      {role}
                                    </span>
                                    {roleInfo && !hasPendingChanges(user) && (
                                      <p className="text-xs text-cream-200">
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
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  saveRoles(user);
                                }}
                                disabled={updating === user.id}
                                className="px-3 py-1.5 text-xs uppercase bg-orange-500 text-cream-50 hover:bg-orange-400 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {updating === user.id ? 'Saving...' : 'Save Roles'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelRoleChanges(user.id);
                                }}
                                disabled={updating === user.id}
                                className="px-3 py-1.5 text-xs uppercase bg-brown-800 text-cream-50 hover:bg-cream-400 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Pronouns</p>
                          <p className="text-cream-50">{user.pronouns || '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">State</p>
                          <p className="text-cream-50">{user.addressState || '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Country</p>
                          <p className="text-cream-50">{user.addressCountry || '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Target Goal</p>
                          <p className="text-cream-50">{user.eventPreference ? GOAL_LABELS[user.eventPreference as GoalPreference] : '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">UTM Source</p>
                          <p className="text-cream-50">{user.utmSource || '—'}</p>
                        </div>
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-1">Signup Page</p>
                          <p className="text-cream-50">{user.signupPage || '—'}</p>
                        </div>
                      </div>

                      {/* Badges */}
                      {user.badges.length > 0 && (
                        <div>
                          <p className="text-cream-200 uppercase text-xs mb-2">Badges</p>
                          <div className="flex flex-wrap gap-2">
                            {getUniqueBadges(user.badges).map((badge) => (
                              <span
                                key={badge.id}
                                className={`text-xs px-2 py-1 ${
                                  badge.grantedAt
                                    ? 'bg-orange-500/20 text-orange-500 border border-orange-500/50'
                                    : 'bg-brown-900 text-cream-50 border border-cream-500/20'
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
                          <p className="text-cream-200 uppercase text-xs mb-2">Projects</p>
                          <div className="space-y-2">
                            {user.projects.map((project) => {
                              const hoursClaimed = project.workSessions.reduce((a, s) => a + s.hoursClaimed, 0);
                              const hoursApproved = project.workSessions.reduce((a, s) => a + (s.hoursApproved ?? 0), 0);
                              const tier = project.tier ? getTierById(project.tier) : null;
                              const bomCost = totalBomCost(project.bomItems, project.bomTax, project.bomShipping);
                              return (
                                <Link
                                  key={project.id}
                                  href={`/admin/projects/${project.id}`}
                                  className="block bg-brown-900 hover:bg-brown-800 px-3 py-2 transition-colors"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-cream-50 text-sm">{project.title}</span>
                                    <div className="flex gap-2">
                                      <span className={`text-xs uppercase ${
                                        project.designStatus === 'approved' ? 'text-green-600' :
                                        project.designStatus === 'rejected' ? 'text-red-600' :
                                        project.designStatus === 'in_review' ? 'text-orange-500' :
                                        'text-cream-50'
                                      }`}>
                                        D: {project.designStatus.replace('_', ' ')}
                                      </span>
                                      <span className={`text-xs uppercase ${
                                        project.buildStatus === 'approved' ? 'text-green-600' :
                                        project.buildStatus === 'rejected' ? 'text-red-600' :
                                        project.buildStatus === 'in_review' ? 'text-orange-500' :
                                        'text-cream-50'
                                      }`}>
                                        B: {project.buildStatus.replace('_', ' ')}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-cream-50">
                                    {tier && (
                                      <>
                                        <span>T{tier.id} ({tier.bits} bits)</span>
                                        <span>•</span>
                                      </>
                                    )}
                                    {project.bitsAwarded != null && (
                                      <>
                                        <span className="text-green-500">{project.bitsAwarded} bits awarded</span>
                                        <span>•</span>
                                      </>
                                    )}
                                    {(bomCost > 0 || project.bomItems.length > 0) && !project.noBomNeeded && (
                                      <>
                                        <span>${bomCost.toFixed(2)} BOM</span>
                                        <span>•</span>
                                      </>
                                    )}
                                    {project.noBomNeeded && (
                                      <>
                                        <span className="text-cream-200">No BOM</span>
                                        <span>•</span>
                                      </>
                                    )}
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
                                              : 'bg-brown-800 text-cream-50 border border-cream-500/20'
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
                      <div className="flex flex-wrap gap-3 pt-2 border-t border-cream-500/20">
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
                              ? 'bg-brown-800 text-cream-200 cursor-not-allowed'
                              : 'bg-orange-500 text-cream-50 hover:bg-orange-400'
                          } disabled:opacity-50`}
                        >
                          {loadingPurchases === user.id
                            ? 'Loading...'
                            : user.shopPurchaseCount === 0
                              ? 'No Purchases'
                              : `View ${user.shopPurchaseCount} Purchase${user.shopPurchaseCount !== 1 ? 's' : ''}`}
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`Impersonate ${user.name || user.email}? You will be logged in as this user.`)) return;
                            try {
                              const res = await fetch('/api/admin/impersonate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ userId: user.id }),
                              });
                              if (!res.ok) {
                                const err = await res.json();
                                alert(err.error || 'Failed to impersonate');
                                return;
                              }
                              window.location.href = '/dashboard';
                            } catch {
                              alert('Failed to impersonate');
                            }
                          }}
                          className="px-4 py-2 text-sm uppercase bg-purple-600 text-white hover:bg-purple-500 transition-colors cursor-pointer"
                        >
                          Impersonate
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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

          {/* Role Change Confirmation Modal */}
          {roleConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => setRoleConfirm(null)} />
              <div className="relative bg-brown-800 border-4 border-red-600 p-6 max-w-md w-full mx-4 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 flex items-center justify-center bg-red-600 text-white text-2xl flex-shrink-0">
                    ⚠
                  </div>
                  <div>
                    <h2 className="text-lg uppercase tracking-wide text-red-600 font-bold">
                      Warning: Role Change
                    </h2>
                    <p className="text-sm text-cream-50">
                      This action modifies permissions for <strong>{roleConfirm.user.name || roleConfirm.user.email}</strong>
                    </p>
                  </div>
                </div>

                <div className="bg-red-50 border border-red-300 p-4 mb-4 space-y-2">
                  {roleConfirm.adding.length > 0 && (
                    <div>
                      <p className="text-xs uppercase text-red-600 font-bold mb-1">Granting Roles:</p>
                      <div className="flex flex-wrap gap-1">
                        {roleConfirm.adding.map(role => (
                          <span key={role} className="text-sm bg-red-600 text-white px-2 py-0.5 uppercase">
                            + {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {roleConfirm.removing.length > 0 && (
                    <div>
                      <p className="text-xs uppercase text-cream-200 font-bold mb-1">Removing Roles:</p>
                      <div className="flex flex-wrap gap-1">
                        {roleConfirm.removing.map(role => (
                          <span key={role} className="text-sm bg-cream-400 text-cream-50 px-2 py-0.5 uppercase line-through">
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-red-600 uppercase tracking-wider mb-4">
                  Role changes take effect immediately and grant access to sensitive admin functionality. Please verify this is intentional.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setRoleConfirm(null)}
                    className="flex-1 px-4 py-2.5 text-sm uppercase bg-brown-800 text-cream-50 hover:bg-cream-400 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSaveRoles}
                    className="flex-1 px-4 py-2.5 text-sm uppercase bg-red-600 text-white hover:bg-red-500 transition-colors cursor-pointer font-bold"
                  >
                    Confirm Role Change
                  </button>
                </div>
              </div>
            </div>
          )}

          <ConfirmModal
            isOpen={grantConfirm !== null}
            title="Register on Attend?"
            message={grantConfirm ? `Register ${grantConfirm.name || grantConfirm.email} on Attend and send the Stasis confirmation email. This does not write a shop purchase row — they can still buy the ticket separately.` : ''}
            confirmLabel="Register"
            cancelLabel="Cancel"
            variant="info"
            onConfirm={() => {
              const user = grantConfirm;
              setGrantConfirm(null);
              if (user) performGrant(user);
            }}
            onCancel={() => setGrantConfirm(null)}
          />

          <ConfirmModal
            isOpen={grantError !== null}
            title="Grant failed"
            message={grantError ?? ''}
            variant="error"
            singleButton
            confirmLabel="OK"
            onConfirm={() => setGrantError(null)}
            onCancel={() => setGrantError(null)}
          />

          {/* Purchases Modal */}
          {purchasesModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#3D3229]/80" onClick={() => setPurchasesModal(null)} />
              <div className="relative bg-brown-800 border-2 border-brown-800 p-6 max-w-lg w-full mx-4 shadow-lg max-h-[80vh] flex flex-col">
                <button
                  onClick={() => setPurchasesModal(null)}
                  className="absolute -top-4 -right-4 w-10 h-10 flex items-center justify-center bg-brown-800 border border-cream-600 text-cream-50 hover:text-orange-500 text-lg leading-none cursor-pointer transition-colors"
                >
                  &times;
                </button>

                <h2 className="text-lg uppercase tracking-wide mb-1 text-cream-50">
                  Purchases
                </h2>
                <p className="text-cream-200 text-sm mb-4">
                  {purchasesModal.user.name || purchasesModal.user.email}
                </p>

                {purchasesModal.purchases.length === 0 ? (
                  <p className="text-cream-200 text-sm text-center py-4">No purchases found.</p>
                ) : (
                  <div className="overflow-y-auto overflow-x-auto flex-1 -mx-6 px-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-cream-500/20">
                          <th className="text-left text-cream-50 text-xs uppercase px-3 py-2">Item</th>
                          <th className="text-right text-cream-50 text-xs uppercase px-3 py-2">Bits</th>
                          <th className="text-right text-cream-50 text-xs uppercase px-3 py-2">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchasesModal.purchases.map((purchase) => (
                          <tr key={purchase.id} className="border-b border-cream-500/10 last:border-b-0">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {purchase.imageUrl && (
                                  <img src={purchase.imageUrl} alt="" className="w-6 h-6 object-contain border border-cream-500/20 flex-shrink-0" />
                                )}
                                <span className="text-cream-50">{purchase.itemName}</span>
                              </div>
                            </td>
                            <td className="text-right px-3 py-2 text-orange-400 font-mono">
                              {purchase.amount.toLocaleString()}
                            </td>
                            <td className="text-right px-3 py-2 text-cream-50 whitespace-nowrap">
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
