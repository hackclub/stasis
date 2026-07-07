'use client'

import { useState, useEffect, useCallback } from 'react'

interface ExtUser {
  id: string
  name: string | null
  email: string
  slackId: string | null
  submissionExtensionUntil: string | null
}

interface ExtProject {
  id: string
  title: string
  designStatus: string
  buildStatus: string
  submissionExtensionUntil: string | null
  user: { id: string; name: string | null; email: string }
}

function defaultUntil(): string {
  // Prefill: one week from now, end of hour, in local time (datetime-local format)
  const d = new Date()
  d.setDate(d.getDate() + 7)
  d.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatUntil(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString()
}

function isExpired(iso: string | null): boolean {
  return !!iso && new Date(iso) <= new Date()
}

export default function AdminExtensionsPage() {
  const [activeUsers, setActiveUsers] = useState<ExtUser[]>([])
  const [activeProjects, setActiveProjects] = useState<ExtProject[]>([])
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchUsers, setSearchUsers] = useState<ExtUser[]>([])
  const [searchProjects, setSearchProjects] = useState<ExtProject[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  const [until, setUntil] = useState(defaultUntil())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchActive = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/extensions')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setActiveUsers(data.users)
      setActiveProjects(data.projects)
    } catch {
      setError('Failed to load extensions.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchActive() }, [fetchActive])

  const handleSearch = async () => {
    const q = searchQuery.trim()
    if (q.length < 2) return
    setSearching(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/admin/extensions?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setSearchUsers(data.users)
        setSearchProjects(data.projects)
      }
    } catch { /* ignore */ } finally {
      setSearching(false)
    }
  }

  const setExtension = async (targetType: 'user' | 'project', targetId: string, value: string | null) => {
    setBusyId(targetId)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId,
          until: value ? new Date(value).toISOString() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Request failed.')
        return
      }
      setMessage(value ? `Extension set until ${formatUntil(data.until)}.` : 'Extension revoked.')
      await fetchActive()
      if (searched) await handleSearch()
    } catch {
      setError('Network error.')
    } finally {
      setBusyId(null)
    }
  }

  const grant = (targetType: 'user' | 'project', targetId: string) => {
    if (!until) { setError('Pick an extension deadline first.'); return }
    setExtension(targetType, targetId, until)
  }

  const revoke = (targetType: 'user' | 'project', targetId: string, label: string) => {
    if (!confirm(`Revoke the submission extension for ${label}?`)) return
    setExtension(targetType, targetId, null)
  }

  const inputClass = 'bg-brown-800 border-2 border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none'
  const btnClass = 'border-2 border-cream-500/20 px-3 py-1.5 text-xs uppercase tracking-wide cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="max-w-5xl">
      <h1 className="text-cream-50 text-2xl mb-1">Submission Extensions</h1>
      <p className="text-cream-200 text-sm mb-6">
        Let specific users or projects keep submitting after the event has closed.
        A user extension covers everything on their account (including new projects);
        a project extension covers only that project.
      </p>

      {message && <p className="text-green-400 text-sm mb-4">{message}</p>}
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Grant */}
      <div className="bg-brown-800 border-2 border-cream-500/20 p-4 mb-8">
        <h2 className="text-cream-50 text-lg mb-3">Grant an extension</h2>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="ext-search" className="text-cream-200 text-xs uppercase tracking-wide">Find user or project</label>
            <input
              id="ext-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
              placeholder="Name, email, Slack ID, project title or ID"
              className={`${inputClass} w-80`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="ext-until" className="text-cream-200 text-xs uppercase tracking-wide">Extension deadline (your local time)</label>
            <input
              id="ext-until"
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || searchQuery.trim().length < 2}
            className={`${btnClass} bg-orange-500/20 border-orange-500 text-orange-400 hover:bg-orange-500/30`}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {searched && !searching && searchUsers.length === 0 && searchProjects.length === 0 && (
          <p className="text-cream-200 text-sm">No matching users or projects.</p>
        )}

        {searchUsers.length > 0 && (
          <div className="mb-4">
            <p className="text-cream-200 text-xs uppercase tracking-wide mb-2">Users</p>
            <div className="flex flex-col gap-2">
              {searchUsers.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 border border-cream-500/10 px-3 py-2">
                  <div>
                    <p className="text-cream-50 text-sm">{u.name ?? '(no name)'} <span className="text-cream-200">{u.email}</span></p>
                    <p className="text-cream-200 text-xs">
                      {u.slackId ?? 'no slack'}
                      {u.submissionExtensionUntil && ` | current extension: ${formatUntil(u.submissionExtensionUntil)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => grant('user', u.id)}
                    disabled={busyId === u.id}
                    className={`${btnClass} bg-orange-500/20 border-orange-500 text-orange-400 hover:bg-orange-500/30`}
                  >
                    {busyId === u.id ? 'Saving...' : u.submissionExtensionUntil ? 'Update' : 'Grant'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchProjects.length > 0 && (
          <div>
            <p className="text-cream-200 text-xs uppercase tracking-wide mb-2">Projects</p>
            <div className="flex flex-col gap-2">
              {searchProjects.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border border-cream-500/10 px-3 py-2">
                  <div>
                    <p className="text-cream-50 text-sm">{p.title} <span className="text-cream-200">by {p.user.name ?? p.user.email}</span></p>
                    <p className="text-cream-200 text-xs">
                      design: {p.designStatus} | build: {p.buildStatus}
                      {p.submissionExtensionUntil && ` | current extension: ${formatUntil(p.submissionExtensionUntil)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => grant('project', p.id)}
                    disabled={busyId === p.id}
                    className={`${btnClass} bg-orange-500/20 border-orange-500 text-orange-400 hover:bg-orange-500/30`}
                  >
                    {busyId === p.id ? 'Saving...' : p.submissionExtensionUntil ? 'Update' : 'Grant'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Existing extensions */}
      <div className="bg-brown-800 border-2 border-cream-500/20 p-4">
        <h2 className="text-cream-50 text-lg mb-3">Existing extensions</h2>
        {loading ? (
          <p className="text-cream-200 text-sm">Loading...</p>
        ) : activeUsers.length === 0 && activeProjects.length === 0 ? (
          <p className="text-cream-200 text-sm">No extensions granted.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-cream-200 text-xs uppercase tracking-wide text-left">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Until</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {activeUsers.map((u) => (
                <tr key={u.id} className="border-t border-cream-500/10">
                  <td className="py-2 pr-4 text-cream-200">User</td>
                  <td className="py-2 pr-4 text-cream-50">{u.name ?? '(no name)'} <span className="text-cream-200">{u.email}</span></td>
                  <td className="py-2 pr-4 text-cream-50">{formatUntil(u.submissionExtensionUntil)}</td>
                  <td className="py-2 pr-4">
                    {isExpired(u.submissionExtensionUntil)
                      ? <span className="text-red-400">Expired</span>
                      : <span className="text-green-400">Active</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => revoke('user', u.id, u.name ?? u.email)}
                      disabled={busyId === u.id}
                      className={`${btnClass} border-red-400/50 text-red-400 hover:bg-red-400/10`}
                    >
                      {busyId === u.id ? '...' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
              {activeProjects.map((p) => (
                <tr key={p.id} className="border-t border-cream-500/10">
                  <td className="py-2 pr-4 text-cream-200">Project</td>
                  <td className="py-2 pr-4 text-cream-50">{p.title} <span className="text-cream-200">by {p.user.name ?? p.user.email}</span></td>
                  <td className="py-2 pr-4 text-cream-50">{formatUntil(p.submissionExtensionUntil)}</td>
                  <td className="py-2 pr-4">
                    {isExpired(p.submissionExtensionUntil)
                      ? <span className="text-red-400">Expired</span>
                      : <span className="text-green-400">Active</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => revoke('project', p.id, p.title)}
                      disabled={busyId === p.id}
                      className={`${btnClass} border-red-400/50 text-red-400 hover:bg-red-400/10`}
                    >
                      {busyId === p.id ? '...' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
