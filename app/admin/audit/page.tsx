'use client';

import { useState, useEffect, useCallback } from 'react';

const AUDIT_ACTIONS = [
  'ADMIN_GRANT_ADMIN',
  'ADMIN_REVOKE_ADMIN',
  'ADMIN_FLAG_FRAUD',
  'ADMIN_UNFLAG_FRAUD',
  'ADMIN_APPROVE_DESIGN',
  'ADMIN_REJECT_DESIGN',
  'ADMIN_APPROVE_BUILD',
  'ADMIN_REJECT_BUILD',
  'ADMIN_REQUEST_UPDATE',
  'ADMIN_REVIEW_SESSION',
  'ADMIN_APPROVE_BOM',
  'ADMIN_REJECT_BOM',
  'SUPERADMIN_GRANT',
  'USER_DELETE_PROJECT',
  'USER_SUBMIT_PROJECT',
] as const;

interface AuditLog {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState(1);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '50');
      if (actionFilter) params.set('action', actionFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, startDate, endDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function formatTarget(log: AuditLog): string {
    if (log.targetType && log.targetId) {
      return `${log.targetType}: ${log.targetId}`;
    }
    if (log.targetType) return log.targetType;
    if (log.targetId) return log.targetId;
    return '—';
  }

  function formatActor(log: AuditLog): string {
    if (log.actorEmail) return log.actorEmail;
    if (log.actorId) return log.actorId;
    return '—';
  }

  return (
    <>
          {/* Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <p className="text-cream-700 text-sm uppercase">
                {pagination?.total ?? 0} log{(pagination?.total ?? 0) !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                <select
                  value={actionFilter}
                  onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                  className="bg-cream-100 border-2 border-cream-400 px-4 py-2 text-cream-800 focus:border-brand-500 focus:outline-none"
                >
                  <option value="">All Actions</option>
                  {AUDIT_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {action.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                  placeholder="Start Date"
                  className="bg-cream-100 border-2 border-cream-400 px-4 py-2 text-cream-800 focus:border-brand-500 focus:outline-none"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                  placeholder="End Date"
                  className="bg-cream-100 border-2 border-cream-400 px-4 py-2 text-cream-800 focus:border-brand-500 focus:outline-none"
                />
                {(actionFilter || startDate || endDate) && (
                  <button
                    onClick={() => { setActionFilter(''); setStartDate(''); setEndDate(''); setPage(1); }}
                    className="px-4 py-2 text-sm uppercase text-cream-700 hover:text-brand-500 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Logs Table */}
          {loading ? (
            <div className="text-center py-8">
              <p className="text-cream-700">Loading audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
              <p className="text-cream-700">No audit logs found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-cream-400">
                      <th className="text-left text-cream-600 text-xs uppercase py-3 px-3">Timestamp</th>
                      <th className="text-left text-cream-600 text-xs uppercase py-3 px-3">Action</th>
                      <th className="text-left text-cream-600 text-xs uppercase py-3 px-3">Actor</th>
                      <th className="text-left text-cream-600 text-xs uppercase py-3 px-3">Target</th>
                      <th className="text-left text-cream-600 text-xs uppercase py-3 px-3">IP Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-cream-400 hover:bg-cream-200 transition-colors">
                        <td className="py-3 px-3 text-cream-700 text-sm whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-brand-500 text-sm">
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-cream-800 text-sm">
                          {formatActor(log)}
                        </td>
                        <td className="py-3 px-3 text-cream-700 text-sm max-w-xs truncate">
                          {formatTarget(log)}
                        </td>
                        <td className="py-3 px-3 text-cream-700 text-sm">
                          {log.actorIp || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-cream-700 text-sm">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                      className="px-4 py-2 bg-cream-100 border border-cream-400 text-cream-800 text-sm uppercase hover:border-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page >= pagination.totalPages}
                      className="px-4 py-2 bg-cream-100 border border-cream-400 text-cream-800 text-sm uppercase hover:border-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
    </>
  );
}
