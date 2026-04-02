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
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/admin/teams');
      if (res.ok) {
        const data = await res.json();
        setTeams(data);
      }
    } catch {
      // silently fail
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
    } catch {
      // silently fail
    } finally {
      setToggling(null);
    }
  };

  const toggleExpand = (teamId: string) => {
    setExpandedTeam(expandedTeam === teamId ? null : teamId);
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
      <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-4 font-bold">
        Teams ({teams.length})
      </h3>

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
                      <td colSpan={4} className="px-3 py-2 bg-cream-50">
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
    </div>
  );
}
