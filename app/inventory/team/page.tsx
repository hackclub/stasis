'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';

interface AccessInfo {
  allowed: boolean;
  reason?: string;
  isAdmin: boolean;
  teamId?: string;
  teamName?: string;
}

interface TeamMember {
  id: string;
  name: string;
  slackDisplayName?: string;
  image?: string;
}

interface TeamDetail {
  id: string;
  name: string;
  locked: boolean;
  members: TeamMember[];
}

interface TeamListItem {
  id: string;
  name: string;
  locked: boolean;
  _count: { members: number };
}

export default function TeamPage() {
  const { data: session } = useSession();
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create team form
  const [newTeamName, setNewTeamName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit team name
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Add member
  const [addSlackId, setAddSlackId] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);

  // Leave/remove
  const [isLeaving, setIsLeaving] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const fetchAccess = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/access');
      if (!res.ok) throw new Error('Failed to check access');
      const data = await res.json();
      setAccess(data);
      return data as AccessInfo;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check access');
      return null;
    }
  }, []);

  const fetchTeamDetail = useCallback(async (teamId: string) => {
    try {
      const res = await fetch(`/api/inventory/teams/${teamId}`);
      if (!res.ok) throw new Error('Failed to load team');
      const data = await res.json();
      setTeam(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/teams');
      if (!res.ok) throw new Error('Failed to load teams');
      const data = await res.json();
      setTeams(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const accessData = await fetchAccess();
    if (accessData?.teamId) {
      await fetchTeamDetail(accessData.teamId);
    } else {
      setTeam(null);
      await fetchTeams();
    }
    setLoading(false);
  }, [fetchAccess, fetchTeamDetail, fetchTeams]);

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session, loadData]);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/inventory/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create team');
      }

      setNewTeamName('');
      showSuccess('Team created!');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinTeam = async (teamId: string) => {
    setError(null);

    try {
      const res = await fetch(`/api/inventory/teams/${teamId}/join`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join team');
      }

      showSuccess('Joined team!');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join team');
    }
  };

  const handleSaveName = async () => {
    if (!team || !editName.trim()) return;
    setIsSavingName(true);
    setError(null);

    try {
      const res = await fetch(`/api/inventory/teams/${team.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update team name');
      }

      setEditingName(false);
      showSuccess('Team name updated!');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update team name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleAddMember = async () => {
    if (!team || !addSlackId.trim()) return;
    setIsAddingMember(true);
    setError(null);

    try {
      const res = await fetch(`/api/inventory/teams/${team.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slackId: addSlackId.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add member');
      }

      setAddSlackId('');
      showSuccess('Member added!');
      await fetchTeamDetail(team.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!team) return;
    setRemovingUserId(userId);
    setError(null);

    try {
      const res = await fetch(`/api/inventory/teams/${team.id}/members/${userId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove member');
      }

      showSuccess('Member removed.');
      await fetchTeamDetail(team.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemovingUserId(null);
    }
  };

  const handleLeaveTeam = async () => {
    if (!team) return;
    setIsLeaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/inventory/teams/${team.id}/leave`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to leave team');
      }

      setConfirmLeave(false);
      showSuccess('You left the team.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave team');
    } finally {
      setIsLeaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Success message */}
      {successMessage && (
        <div className="mb-6 border-2 border-green-600 bg-green-50 px-4 py-3 text-green-800 text-sm">
          {successMessage}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-6 border-2 border-red-600 bg-red-50 px-4 py-3 text-red-800 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Has team view */}
      {team ? (
        <div>
          {/* Team name */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              {editingName ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-lg"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={isSavingName || !editName.trim()}
                    className="px-3 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSavingName ? '...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="px-3 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-cream-200 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="text-brown-800 font-bold text-xl uppercase tracking-wide">{team.name}</h2>
                  {team.locked ? (
                    <span className="px-2 py-0.5 text-xs uppercase tracking-wider bg-cream-200 border border-cream-400 text-brown-800/70">
                      Locked
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setEditName(team.name);
                        setEditingName(true);
                      }}
                      className="text-brown-800/50 hover:text-orange-500 transition-colors text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Members */}
          <div className="mb-6">
            <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-3">Members</h3>
            <div className="space-y-2">
              {team.members.map(member => (
                <div
                  key={member.id}
                  className="border-2 border-brown-800 bg-cream-100 p-3 flex items-center gap-3"
                >
                  {member.image ? (
                    <img src={member.image} alt="" className="w-8 h-8 border border-cream-400" />
                  ) : (
                    <div className="w-8 h-8 bg-cream-200 border border-cream-400 flex items-center justify-center">
                      <span className="text-brown-800/30 text-xs">?</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-brown-800 text-sm font-bold truncate block">{member.name}</span>
                    {member.slackDisplayName && (
                      <span className="text-brown-800/50 text-xs truncate block">{member.slackDisplayName}</span>
                    )}
                  </div>
                  {member.id !== session?.user.id && !team.locked && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={removingUserId === member.id}
                      className="text-brown-800/50 hover:text-red-600 text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-30"
                    >
                      {removingUserId === member.id ? '...' : 'Remove'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add member */}
          {!team.locked && (
            <div className="mb-6">
              <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-3">Add Member</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addSlackId}
                  onChange={e => setAddSlackId(e.target.value)}
                  placeholder="Slack User ID"
                  className="flex-1 border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-sm placeholder:text-brown-800/30"
                />
                <button
                  onClick={handleAddMember}
                  disabled={isAddingMember || !addSlackId.trim()}
                  className="px-4 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-brown-800 hover:text-cream-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-brown-800 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isAddingMember ? '...' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {/* Leave team */}
          <div className="border-t border-cream-400 pt-6">
            {confirmLeave ? (
              <div className="flex items-center gap-3">
                <span className="text-brown-800 text-sm">Are you sure you want to leave?</span>
                <button
                  onClick={handleLeaveTeam}
                  disabled={isLeaving}
                  className="px-4 py-2 text-sm uppercase tracking-wider border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-cream-50 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLeaving ? 'Leaving...' : 'Yes, Leave'}
                </button>
                <button
                  onClick={() => setConfirmLeave(false)}
                  className="px-4 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-cream-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmLeave(true)}
                className="px-4 py-2 text-sm uppercase tracking-wider border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-cream-50 transition-colors cursor-pointer"
              >
                Leave Team
              </button>
            )}
          </div>
        </div>
      ) : (
        /* No team view */
        <div>
          {/* Create team */}
          <div className="mb-8">
            <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-3">Create a Team</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                placeholder="Team name"
                className="flex-1 border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-sm placeholder:text-brown-800/30"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateTeam();
                }}
              />
              <button
                onClick={handleCreateTeam}
                disabled={isCreating || !newTeamName.trim()}
                className="px-4 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-30 disabled:hover:bg-orange-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>

          {/* Join a team */}
          <div>
            <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-3">Join a Team</h2>
            {teams.length === 0 ? (
              <p className="text-brown-800/50 text-sm">No teams available to join.</p>
            ) : (
              <div className="space-y-2">
                {teams.map(t => (
                  <div
                    key={t.id}
                    className="border-2 border-brown-800 bg-cream-100 p-3 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-brown-800 text-sm font-bold">{t.name}</span>
                      <span className="text-brown-800/50 text-xs ml-2">
                        {t._count.members} member{t._count.members !== 1 ? 's' : ''}
                      </span>
                      {t.locked && (
                        <span className="ml-2 px-2 py-0.5 text-xs uppercase tracking-wider bg-cream-200 border border-cream-400 text-brown-800/70">
                          Locked
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleJoinTeam(t.id)}
                      disabled={t.locked}
                      className="px-3 py-1 text-xs uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-brown-800 hover:text-cream-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-brown-800 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
