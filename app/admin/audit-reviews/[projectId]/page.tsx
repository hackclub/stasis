'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getTierById } from '@/lib/tiers';

const TIER_COLORS: Record<number, string> = {
  1: 'bg-gray-200 text-gray-800',
  2: 'bg-green-200 text-green-800',
  3: 'bg-blue-200 text-blue-800',
  4: 'bg-purple-200 text-purple-800',
  5: 'bg-orange-200 text-orange-800',
};

const RESULT_COLORS: Record<string, string> = {
  APPROVED: 'bg-green-200 text-green-800',
  RETURNED: 'bg-orange-200 text-orange-800',
  REJECTED: 'bg-red-200 text-red-800',
};

const DECISION_COLORS: Record<string, string> = {
  APPROVED: 'bg-green-200 text-green-800',
  CHANGE_REQUESTED: 'bg-orange-200 text-orange-800',
  REJECTED: 'bg-red-200 text-red-800',
};

interface TimelineEntry {
  type: 'review' | 'action';
  createdAt: string;
  stage: string;
  result: string | null;
  decision: string | null;
  feedback: string | null;
  reason: string | null;
  comments: string | null;
  reviewer: { id: string; name: string | null; image: string | null } | null;
  invalidated: boolean;
  isAdminReview: boolean;
  frozenWorkUnits: number | null;
  frozenTier: number | null;
  frozenFundingAmount: number | null;
  tierOverride: number | null;
  grantOverride: number | null;
  workUnitsOverride: number | null;
  grantAmount: number | null;
  tier: number | null;
  tierBefore: number | null;
}

interface ProjectData {
  id: string;
  title: string;
  tier: number | null;
  coverImage: string | null;
  designStatus: string;
  buildStatus: string;
  author: { id: string; name: string | null; image: string | null; email: string };
  totalHours: number;
  bomCost: number;
  costPerHour: number;
  bitsPerHour: number | null;
  tierBits: number;
  entryCount: number;
  workSessions: Array<{
    id: string;
    title: string;
    hoursClaimed: number;
    hoursApproved: number | null;
    categories: string[];
    stage: string;
    createdAt: string;
  }>;
  bomItems: Array<{
    id: string;
    name: string;
    costPerItem: number;
    quantity: number;
    status: string;
    link: string | null;
  }>;
}

export default function ProjectReviewHistoryPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<ProjectData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit-reviews/${projectId}`);
      if (!res.ok) {
        setError(res.status === 404 ? 'Project not found' : 'Failed to load');
        return;
      }
      const data = await res.json();
      setProject(data.project);
      setTimeline(data.timeline);
    } catch (err) {
      console.error('Failed to fetch project review history:', err);
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-brown-800">Loading project review history...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
        <p className="text-brown-800">{error || 'Project not found'}</p>
        <Link href="/admin/audit-reviews" className="text-orange-500 text-sm mt-2 inline-block hover:underline">
          Back to Audit Reviews
        </Link>
      </div>
    );
  }

  const tierInfo = project.tier ? getTierById(project.tier) : null;

  return (
    <>
      {/* Navigation */}
      <div className="mb-4 flex gap-3 text-sm">
        <Link href="/admin/audit-reviews" className="text-orange-500 hover:underline">
          Audit Reviews
        </Link>
        <span className="text-cream-600">/</span>
        <span className="text-brown-800">{project.title}</span>
      </div>

      {/* Project Header */}
      <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-6">
        <div className="flex items-start gap-4">
          {project.coverImage && (
            <img
              src={project.coverImage}
              alt=""
              className="w-16 h-16 object-cover border border-cream-400 flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h2 className="text-brown-800 text-lg font-medium">{project.title}</h2>
              {tierInfo && (
                <span className={`text-xs px-2 py-0.5 ${TIER_COLORS[tierInfo.id] || ''}`}>
                  {tierInfo.name} ({tierInfo.bits}b)
                </span>
              )}
              <Link
                href={`/admin/projects/${project.id}`}
                className="text-xs text-orange-500 hover:underline uppercase"
              >
                View in Admin
              </Link>
            </div>
            <div className="flex items-center gap-2 mb-2">
              {project.author.image && (
                <img src={project.author.image} alt="" className="w-5 h-5 rounded-full" />
              )}
              <span className="text-brown-800 text-sm">
                {project.author.name || project.author.email}
              </span>
            </div>
            <div className="flex gap-4 flex-wrap text-sm">
              <span className="text-brown-800">{project.totalHours}h total</span>
              <span className="text-brown-800">${project.bomCost.toFixed(2)} BOM</span>
              {project.costPerHour > 0 && (
                <span className="text-brown-800">${project.costPerHour.toFixed(2)}/h</span>
              )}
              {project.bitsPerHour !== null && (
                <span className="text-orange-500">{project.bitsPerHour} bits/h</span>
              )}
              <span className="text-cream-600">{project.entryCount} entries</span>
              <span className="text-cream-600">Design: {project.designStatus}</span>
              <span className="text-cream-600">Build: {project.buildStatus}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Work Sessions Summary */}
      {project.workSessions.length > 0 && (
        <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-6">
          <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-3">
            Work Sessions ({project.workSessions.length})
          </h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {project.workSessions.map((ws) => (
              <div key={ws.id} className="flex items-center gap-3 text-sm">
                <span className={`text-xs uppercase px-1.5 py-0.5 ${
                  ws.stage === 'DESIGN' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>
                  {ws.stage}
                </span>
                <span className="text-brown-800 truncate max-w-[200px]">{ws.title}</span>
                <span className="text-brown-800">
                  {ws.hoursApproved !== null ? `${ws.hoursApproved}h` : `${ws.hoursClaimed}h`}
                  {ws.hoursApproved !== null && ws.hoursApproved !== ws.hoursClaimed && (
                    <span className="text-cream-600"> (claimed {ws.hoursClaimed}h)</span>
                  )}
                </span>
                <span className="text-cream-600 text-xs ml-auto">
                  {new Date(ws.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BOM Summary */}
      {project.bomItems.length > 0 && (
        <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-6">
          <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-3">
            Bill of Materials ({project.bomItems.length})
          </h3>
          <div className="space-y-1">
            {project.bomItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <span className={`text-xs uppercase px-1.5 py-0.5 ${
                  item.status === 'approved'
                    ? 'bg-green-100 text-green-800'
                    : item.status === 'rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {item.status}
                </span>
                <span className="text-brown-800">{item.name}</span>
                <span className="text-brown-800">
                  ${(item.costPerItem * item.quantity).toFixed(2)}
                  {item.quantity > 1 && ` (${item.quantity}x $${item.costPerItem.toFixed(2)})`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Timeline */}
      <h3 className="text-brown-800 text-xs uppercase tracking-wider mb-4">
        Review Timeline ({timeline.length})
      </h3>
      {timeline.length === 0 ? (
        <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
          <p className="text-brown-800">No reviews yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {timeline.map((entry, idx) => (
            <div
              key={idx}
              className={`bg-cream-100 border-2 border-cream-400 p-4 ${
                entry.invalidated ? 'opacity-50' : ''
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                {entry.reviewer?.image && (
                  <img src={entry.reviewer.image} alt="" className="w-6 h-6 rounded-full" />
                )}
                <span className="text-brown-800 text-sm font-medium">
                  {entry.reviewer?.name || 'Unknown'}
                </span>
                {entry.type === 'review' && entry.result && (
                  <span className={`text-xs uppercase px-2 py-0.5 ${RESULT_COLORS[entry.result] || ''}`}>
                    {entry.result}
                  </span>
                )}
                {entry.type === 'action' && entry.decision && (
                  <span className={`text-xs uppercase px-2 py-0.5 ${DECISION_COLORS[entry.decision] || ''}`}>
                    {entry.decision.replace('_', ' ')}
                  </span>
                )}
                <span className={`text-xs uppercase px-2 py-0.5 ${
                  entry.stage === 'DESIGN' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>
                  {entry.stage}
                </span>
                <span className="text-xs uppercase px-2 py-0.5 bg-cream-200 text-cream-600">
                  {entry.type === 'review' ? 'Submission Review' : 'Legacy Action'}
                </span>
                {entry.isAdminReview && (
                  <span className="text-xs uppercase px-2 py-0.5 bg-purple-100 text-purple-800">Admin</span>
                )}
                {entry.invalidated && (
                  <span className="text-xs uppercase px-2 py-0.5 bg-red-100 text-red-800">Invalidated</span>
                )}
                <span className="text-brown-800 text-xs ml-auto">
                  {new Date(entry.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {/* Feedback / Comments */}
              {entry.feedback && (
                <div className="mb-2">
                  <p className="text-brown-800 text-sm whitespace-pre-wrap">{entry.feedback}</p>
                </div>
              )}
              {entry.comments && (
                <div className="mb-2">
                  <p className="text-brown-800 text-sm whitespace-pre-wrap">{entry.comments}</p>
                </div>
              )}

              {/* Internal reason */}
              {entry.reason && (
                <div className="mb-2">
                  <span className="text-cream-600 text-xs uppercase">Internal: </span>
                  <span className="text-cream-600 text-sm">{entry.reason}</span>
                </div>
              )}

              {/* Frozen snapshots */}
              {(entry.frozenWorkUnits !== null || entry.frozenTier !== null || entry.frozenFundingAmount !== null) && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {entry.frozenWorkUnits !== null && (
                    <span className="text-xs px-2 py-0.5 bg-cream-200 text-cream-600">
                      Frozen hours: {entry.frozenWorkUnits}h
                    </span>
                  )}
                  {entry.frozenTier !== null && (
                    <span className="text-xs px-2 py-0.5 bg-cream-200 text-cream-600">
                      Frozen tier: {entry.frozenTier}
                    </span>
                  )}
                  {entry.frozenFundingAmount !== null && (
                    <span className="text-xs px-2 py-0.5 bg-cream-200 text-cream-600">
                      Frozen funding: ${entry.frozenFundingAmount}
                    </span>
                  )}
                </div>
              )}

              {/* Overrides */}
              {(entry.tierOverride !== null || entry.grantOverride !== null || entry.workUnitsOverride !== null) && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {entry.tierOverride !== null && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800">
                      Tier override: {entry.tierOverride}
                    </span>
                  )}
                  {entry.grantOverride !== null && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800">
                      Grant override: {entry.grantOverride}b
                    </span>
                  )}
                  {entry.workUnitsOverride !== null && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800">
                      Hours override: {entry.workUnitsOverride}h
                    </span>
                  )}
                </div>
              )}

              {/* Legacy action specifics */}
              {entry.type === 'action' && (entry.grantAmount !== null || entry.tier !== null) && (
                <div className="flex gap-2 flex-wrap">
                  {entry.grantAmount !== null && (
                    <span className="text-xs px-2 py-0.5 bg-cream-200 text-cream-600">
                      Grant: ${entry.grantAmount}
                    </span>
                  )}
                  {entry.tier !== null && (
                    <span className="text-xs px-2 py-0.5 bg-cream-200 text-cream-600">
                      Set tier: {entry.tier}
                      {entry.tierBefore !== null && ` (was ${entry.tierBefore})`}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
