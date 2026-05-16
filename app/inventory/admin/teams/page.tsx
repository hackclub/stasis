'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface TeamMember {
  id: string;
  name: string | null;
  slackDisplayName?: string | null;
}

interface Team {
  id: string;
  name: string;
  members: TeamMember[];
  locked: boolean;
  manufacturingAllowanceMinutes: number;
  manufacturingAutoApprovePrints: boolean;
  maxMembersOverride: number | null;
  maxMembers: number;
  usedPrintAllowanceMinutes: number;
  reservedPrintAllowanceMinutes: number;
}

type BulkTeamAction = 'LOCK_TEAMS' | 'UNLOCK_TEAMS' | 'SET_PRINT_ALLOWANCE' | 'RESET_USED_PRINT_ALLOWANCE' | 'SET_MAX_TEAM_SIZE';

const BULK_ACTION_COPY: Record<BulkTeamAction, { label: string; title: string; body: string }> = {
  LOCK_TEAMS: {
    label: 'Lock Teams',
    title: 'Lock all teams?',
    body: 'Teams will not be able to change members or submit inventory requests until unlocked.',
  },
  UNLOCK_TEAMS: {
    label: 'Unlock Teams',
    title: 'Unlock all teams?',
    body: 'Teams will be able to change members and submit inventory requests again.',
  },
  SET_PRINT_ALLOWANCE: {
    label: 'Set Print Allowance',
    title: 'Set all print allowances?',
    body: 'Each team allowance will change to the hours below. Current used and reserved print time will stay intact.',
  },
  RESET_USED_PRINT_ALLOWANCE: {
    label: 'Reset Used Print Allowance',
    title: 'Reset used print allowance?',
    body: 'Ready and completed prints before this reset will no longer count against team allowance. Queued and printing jobs still count as reserved time.',
  },
  SET_MAX_TEAM_SIZE: {
    label: 'Set Max Team Size',
    title: 'Set max team size?',
    body: 'This changes the default max team size used the next time users join teams. Per-team exceptions stay intact.',
  },
};

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [settings, setSettings] = useState<{ maxTeamSize: number }>({ maxTeamSize: 4 });
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [savingAllowance, setSavingAllowance] = useState<string | null>(null);
  const [savingMaxMembers, setSavingMaxMembers] = useState<string | null>(null);
  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, string>>({});
  const [maxMembersDrafts, setMaxMembersDrafts] = useState<Record<string, string>>({});
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkTeamAction | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkAllowanceHours, setBulkAllowanceHours] = useState('');
  const [bulkMaxTeamSize, setBulkMaxTeamSize] = useState('4');

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/admin/teams');
      if (res.ok) {
        const data = await res.json();
        const loadedTeams: Team[] = Array.isArray(data) ? data : data.teams ?? [];
        if (!Array.isArray(data) && data.settings) setSettings(data.settings);
        setTeams(loadedTeams);
        setAllowanceDrafts((prev) => {
          const next = { ...prev };
          for (const team of loadedTeams) {
            if (next[team.id] === undefined) next[team.id] = String(team.manufacturingAllowanceMinutes / 60);
          }
          return next;
        });
        setMaxMembersDrafts((prev) => {
          const next = { ...prev };
          for (const team of loadedTeams) {
            if (next[team.id] === undefined) next[team.id] = team.maxMembersOverride === null ? '' : String(team.maxMembersOverride);
          }
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to load admin teams', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const toggleLock = async (team: Team) => {
    setToggling(team.id);
    try {
      const res = await fetch(`/api/inventory/admin/teams/${team.id}/lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: !team.locked }),
      });
      if (res.ok) {
        await fetchTeams();
      }
    } catch (error) {
      console.error('Failed to toggle team lock', error);
    } finally {
      setToggling(null);
    }
  };

  const toggleExpand = (teamId: string) => {
    setExpandedTeam(expandedTeam === teamId ? null : teamId);
  };

  const saveAllowance = async (team: Team) => {
    setSavingAllowance(team.id);
    try {
      const hours = Number(allowanceDrafts[team.id] ?? team.manufacturingAllowanceMinutes / 60);
      const res = await fetch(`/api/inventory/admin/teams/${team.id}/manufacturing-allowance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowanceMinutes: Math.max(0, Math.round(hours * 60)) }),
      });
      if (res.ok) await fetchTeams();
    } catch (error) {
      console.error('Failed to save manufacturing allowance', error);
    } finally {
      setSavingAllowance(null);
    }
  };

  const saveMaxMembersOverride = async (team: Team) => {
    setSavingMaxMembers(team.id);
    try {
      const raw = maxMembersDrafts[team.id] ?? '';
      const value = raw.trim() === '' ? null : Math.round(Number(raw));
      if (value !== null && (!Number.isFinite(value) || value < 1 || value > 100)) {
        throw new Error('Enter a max team size between 1 and 100, or leave it blank.');
      }
      const res = await fetch(`/api/inventory/admin/teams/${team.id}/manufacturing-allowance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxMembersOverride: value }),
      });
      if (!res.ok) throw new Error('Failed to save max team size override.');
      await fetchTeams();
    } catch (error) {
      console.error('Failed to save max team size override', error);
    } finally {
      setSavingMaxMembers(null);
    }
  };

  const runBulkAction = async () => {
    if (!bulkAction) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const body: { action: BulkTeamAction; allowanceMinutes?: number; maxTeamSize?: number; confirm: true } = {
        action: bulkAction,
        confirm: true,
      };
      if (bulkAction === 'SET_PRINT_ALLOWANCE') {
        const hours = Number(bulkAllowanceHours);
        if (!Number.isFinite(hours) || hours < 0) {
          throw new Error('Enter a valid print allowance in hours.');
        }
        body.allowanceMinutes = Math.round(hours * 60);
      }
      if (bulkAction === 'SET_MAX_TEAM_SIZE') {
        const maxTeamSize = Math.round(Number(bulkMaxTeamSize));
        if (!Number.isFinite(maxTeamSize) || maxTeamSize < 1 || maxTeamSize > 100) {
          throw new Error('Enter a max team size between 1 and 100.');
        }
        body.maxTeamSize = maxTeamSize;
      }

      const res = await fetch('/api/inventory/admin/teams/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Bulk team action failed.');
      }
      setBulkAction(null);
      setBulkAllowanceHours('');
      setBulkMaxTeamSize(String(settings.maxTeamSize));
      await fetchTeams();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : 'Bulk team action failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12 font-mono">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="font-mono">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-brown-800 text-sm uppercase tracking-wider font-bold">
          Teams ({teams.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(BULK_ACTION_COPY) as BulkTeamAction[]).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => {
                setBulkAction(action);
                setBulkError(null);
                setBulkAllowanceHours(action === 'SET_PRINT_ALLOWANCE' ? defaultBulkAllowanceHours(teams) : '');
                setBulkMaxTeamSize(String(settings.maxTeamSize));
              }}
              className="border-2 border-red-700 bg-red-600 px-3 py-2 text-xs uppercase tracking-wider text-cream-50 hover:bg-red-700"
            >
              {action === 'SET_MAX_TEAM_SIZE'
                ? `${BULK_ACTION_COPY[action].label} (${settings.maxTeamSize})`
                : BULK_ACTION_COPY[action].label}
            </button>
          ))}
        </div>
      </div>

      {teams.length === 0 ? (
        <p className="text-brown-800/60 text-sm">No teams found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-2 border-brown-800 text-sm">
            <thead>
              <tr className="bg-brown-800 text-cream-50">
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Team Name
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Members
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Status
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Print Allowance
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Max Members
                </th>
                <th className="text-left px-3 py-2 uppercase tracking-wider text-xs">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <React.Fragment key={team.id}>
                  <tr className="border-t border-cream-200">
                    <td className="px-3 py-2 text-brown-800 font-bold">
                      <button
                        onClick={() => toggleExpand(team.id)}
                        className="flex items-center gap-2 hover:text-orange-500 transition-colors"
                      >
                        <span className="text-xs">
                          {expandedTeam === team.id ? 'v' : '>'}
                        </span>
                        {team.name}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-brown-800/70">
                      {team.members.length}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs uppercase border tracking-wider ${
                          team.locked
                            ? 'bg-red-100 text-red-700 border-red-700'
                            : 'bg-cream-200 text-brown-800 border-brown-800'
                        }`}
                      >
                        {team.locked ? 'Locked' : 'Active'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={allowanceDrafts[team.id] ?? String(team.manufacturingAllowanceMinutes / 60)}
                          onChange={(event) => setAllowanceDrafts((current) => ({ ...current, [team.id]: event.target.value }))}
                          className="w-20 border border-brown-800 bg-cream-50 px-2 py-1 text-xs text-brown-800"
                        />
                        <span className="text-brown-800/50 text-xs">hours</span>
                        <button
                          onClick={() => saveAllowance(team)}
                          disabled={savingAllowance === team.id}
                          className="px-2 py-1 text-xs uppercase tracking-wider bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-50"
                        >
                          {savingAllowance === team.id ? '...' : 'Save'}
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-brown-800/50">
                        Used {formatMinutes(team.usedPrintAllowanceMinutes)} / {formatMinutes(team.manufacturingAllowanceMinutes)}
                        {team.reservedPrintAllowanceMinutes > 0 ? `, reserved ${formatMinutes(team.reservedPrintAllowanceMinutes)}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          step="1"
                          placeholder={String(settings.maxTeamSize)}
                          value={maxMembersDrafts[team.id] ?? ''}
                          onChange={(event) => setMaxMembersDrafts((current) => ({ ...current, [team.id]: event.target.value }))}
                          className="w-20 border border-brown-800 bg-cream-50 px-2 py-1 text-xs text-brown-800"
                        />
                        <button
                          onClick={() => saveMaxMembersOverride(team)}
                          disabled={savingMaxMembers === team.id}
                          className="px-2 py-1 text-xs uppercase tracking-wider bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-50"
                        >
                          {savingMaxMembers === team.id ? '...' : 'Save'}
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-brown-800/50">
                        Effective {team.maxMembers}; blank uses global
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleLock(team)}
                        disabled={toggling === team.id}
                        className={`px-3 py-1 text-xs uppercase tracking-wider transition-colors disabled:opacity-50 ${
                          team.locked
                            ? 'bg-orange-500 text-cream-50 hover:bg-orange-600'
                            : 'border border-brown-800 text-brown-800 hover:bg-cream-200'
                        }`}
                      >
                        {toggling === team.id
                          ? '...'
                          : team.locked
                          ? 'Unlock'
                          : 'Lock'}
                      </button>
                    </td>
                  </tr>
                  {expandedTeam === team.id && (
                    <tr key={`${team.id}-members`} className="border-t border-cream-100">
                      <td colSpan={6} className="px-3 py-2 bg-cream-50">
                        {team.members.length === 0 ? (
                          <p className="text-brown-800/50 text-xs">No members</p>
                        ) : (
                          <ul className="space-y-0.5">
                            {team.members.map((member) => (
                              <li
                                key={member.id}
                                className="text-brown-800/70 text-xs"
                              >
                                {member.name || member.slackDisplayName || 'Unknown'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bulkAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brown-800/50 p-4">
          <div className="w-full max-w-md border-2 border-red-700 bg-cream-50 p-5 shadow-xl">
            <h4 className="text-red-700 text-sm uppercase tracking-wider font-bold">
              {BULK_ACTION_COPY[bulkAction].title}
            </h4>
            <p className="mt-3 text-sm text-brown-800/80">
              {BULK_ACTION_COPY[bulkAction].body}
            </p>
            {bulkAction === 'SET_PRINT_ALLOWANCE' && (
              <label className="mt-4 block">
                <span className="block text-xs uppercase tracking-wider text-brown-800/60">
                  Print allowance hours
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={bulkAllowanceHours}
                  onChange={(event) => {
                    setBulkAllowanceHours(event.target.value);
                    setBulkError(null);
                  }}
                  className="mt-1 w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                />
              </label>
            )}
            {bulkAction === 'SET_MAX_TEAM_SIZE' && (
              <label className="mt-4 block">
                <span className="block text-xs uppercase tracking-wider text-brown-800/60">
                  Max members per team
                </span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={bulkMaxTeamSize}
                  onChange={(event) => {
                    setBulkMaxTeamSize(event.target.value);
                    setBulkError(null);
                  }}
                  className="mt-1 w-full border-2 border-brown-800 bg-cream-50 px-3 py-2 text-sm text-brown-800"
                />
              </label>
            )}
            <p className="mt-2 text-xs uppercase tracking-wider text-brown-800/50">
              This affects {teams.length} team{teams.length === 1 ? '' : 's'}.
            </p>
            {bulkError && <p className="mt-3 text-sm text-red-700">{bulkError}</p>}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runBulkAction}
                disabled={
                  bulkBusy ||
                  (bulkAction === 'SET_PRINT_ALLOWANCE' && !isValidAllowanceHours(bulkAllowanceHours)) ||
                  (bulkAction === 'SET_MAX_TEAM_SIZE' && !isValidMaxTeamSize(bulkMaxTeamSize))
                }
                className="border-2 border-red-700 bg-red-600 px-4 py-2 text-sm uppercase tracking-wider text-cream-50 hover:bg-red-700 disabled:opacity-50"
              >
                {bulkBusy ? 'Working...' : 'Yes, Continue'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkAction(null);
                  setBulkError(null);
                  setBulkAllowanceHours('');
                  setBulkMaxTeamSize(String(settings.maxTeamSize));
                }}
                disabled={bulkBusy}
                className="border-2 border-brown-800 px-4 py-2 text-sm uppercase tracking-wider text-brown-800 hover:bg-cream-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function defaultBulkAllowanceHours(teams: Team[]) {
  if (teams.length === 0) return '';
  const firstAllowance = teams[0].manufacturingAllowanceMinutes;
  const allSame = teams.every((team) => team.manufacturingAllowanceMinutes === firstAllowance);
  return allSame ? formatHours(firstAllowance) : '';
}

function formatHours(minutes: number) {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
}

function isValidAllowanceHours(value: string) {
  if (value.trim() === '') return false;
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= 0;
}

function isValidMaxTeamSize(value: string) {
  if (value.trim() === '') return false;
  const maxTeamSize = Number(value);
  return Number.isFinite(maxTeamSize) && Number.isInteger(maxTeamSize) && maxTeamSize >= 1 && maxTeamSize <= 100;
}
