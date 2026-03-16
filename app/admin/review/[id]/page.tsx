'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTierById, TIERS } from '@/lib/tiers';

// ─── Types ───────────────────────────────────────────────────────────

interface ReviewData {
  submission: {
    id: string;
    stage: string;
    notes: string | null;
    preReviewed: boolean;
    createdAt: string;
    project: {
      id: string;
      title: string;
      description: string | null;
      coverImage: string | null;
      githubRepo: string | null;
      tier: number | null;
      tags: string[];
      noBomNeeded: boolean;
      cartScreenshots: string[];
      totalWorkUnits: number;
      entryCount: number;
      avgWorkUnits: number;
      maxWorkUnits: number;
      minWorkUnits: number;
      bomCost: number;
      costPerHour: number | null;
      bitsPerHour: number | null;
      user: { id: string; name: string | null; email: string; image: string | null; slackId: string | null; fraudConvicted: boolean; verificationStatus: string | null };
      workSessions: Array<{
        id: string;
        title: string;
        hoursClaimed: number;
        hoursApproved: number | null;
        content: string | null;
        categories: string[];
        createdAt: string;
        media: Array<{ id: string; type: string; url: string }>;
      }>;
      badges: Array<{ id: string; badge: string; claimedAt: string; grantedAt: string | null }>;
      bomItems: Array<{
        id: string;
        name: string;
        purpose: string | null;
        costPerItem: number;
        quantity: number;
        link: string | null;
        status: string;
      }>;
      hackatimeProjects: Array<{
        id: string;
        hackatimeProject: string;
        totalSeconds: number;
        hoursApproved: number | null;
      }>;
      firmwareHours: number;
      journalHours: number;
      submissions: Array<{ id: string; stage: string; createdAt: string }>;
    };
    reviews: Array<{
      id: string;
      reviewerId: string;
      reviewerName: string | null;
      result: string;
      isAdminReview: boolean;
      feedback: string;
      reason: string | null;
      invalidated: boolean;
      workUnitsOverride: number | null;
      tierOverride: number | null;
      grantOverride: number | null;
      categoryOverride: string | null;
      frozenWorkUnits: number | null;
      frozenEntryCount: number | null;
      frozenFundingAmount: number | null;
      frozenTier: number | null;
      frozenReviewerNote: string | null;
      createdAt: string;
    }>;
    claim: { id: string; reviewerId: string; expiresAt: string } | null;
    claimedByOther: boolean;
  };
  conflicts: Array<{ id: string; project: { id: string; title: string } }>;
  reviewerNote: string;
  hackatimeTrustLevel: string | null;
  navigation: { nextId: string | null; prevId: string | null };
  isAdmin: boolean;
  reviewerId: string;
}

// ─── Component ───────────────────────────────────────────────────────

export default function ReviewDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showWorkLog, setShowWorkLog] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState(false);
  const [ghChecks, setGhChecks] = useState<Array<{ key: string; label: string; passed: boolean; detail?: string }> | null>(null);
  const [ghChecksLoading, setGhChecksLoading] = useState(false);
  const [ghChecksError, setGhChecksError] = useState<string | null>(null);

  // Form state
  const [feedback, setFeedback] = useState('');
  const [reason, setReason] = useState('');
  const [workUnitsOverride, setWorkUnitsOverride] = useState('');
  const [tierOverride, setTierOverride] = useState('');
  const [grantOverride, setGrantOverride] = useState('');
  const [categoryOverride, setCategoryOverride] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const noteTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFraudWarning, setShowFraudWarning] = useState(true);
  const [flaggingFraud, setFlaggingFraud] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews/${id}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setInternalNote(d.reviewerNote || '');
      } else if (res.status === 404 || res.status === 400) {
        router.push('/admin/review');
      }
    } catch (err) {
      console.error('Failed to fetch review data:', err);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch GitHub checks when submission loads
  useEffect(() => {
    if (!data?.submission.id) return;
    setGhChecksLoading(true);
    setGhChecksError(null);
    fetch(`/api/reviews/${id}/checks`)
      .then(async (res) => {
        const d = await res.json();
        if (res.ok && d.checks) {
          setGhChecks(d.checks);
        } else {
          setGhChecksError(d.error || d.detail || `HTTP ${res.status}`);
        }
      })
      .catch((err) => setGhChecksError(String(err)))
      .finally(() => setGhChecksLoading(false));
  }, [data?.submission.id, id]);

  // Auto-claim on mount
  useEffect(() => {
    if (data && !data.submission.claimedByOther && !data.submission.claim) {
      claimSubmission();
    }
    // Release claim on unmount (navigate away)
    return () => {
      fetch(`/api/reviews/${id}/claim`, { method: 'DELETE' }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.submission.id]);

  async function claimSubmission() {
    setClaiming(true);
    try {
      await fetch(`/api/reviews/${id}/claim`, { method: 'POST' });
      await fetchData();
    } finally {
      setClaiming(false);
    }
  }

  async function saveNote(content: string) {
    try {
      await fetch(`/api/reviews/${id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }

  function handleNoteChange(value: string) {
    setInternalNote(value);
    if (noteTimeout.current) clearTimeout(noteTimeout.current);
    noteTimeout.current = setTimeout(() => saveNote(value), 1000);
  }

  async function submitReview(result: string) {
    if (!feedback.trim()) {
      alert('Feedback for submitter is required.');
      return;
    }

    if ((result === 'APPROVED' || result === 'REJECTED') && !confirm(`Are you sure you want to ${result.toLowerCase()} this submission?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        result,
        feedback: feedback.trim(),
        reason: reason.trim() || undefined,
      };
      if (workUnitsOverride) body.workUnitsOverride = parseFloat(workUnitsOverride);
      if (tierOverride) body.tierOverride = parseInt(tierOverride);
      if (grantOverride) body.grantOverride = parseInt(grantOverride);
      if (categoryOverride && data?.isAdmin) body.categoryOverride = categoryOverride;

      const res = await fetch(`/api/reviews/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        // Navigate to next or back to queue
        if (data?.navigation.nextId) {
          router.push(`/admin/review/${data.navigation.nextId}`);
        } else {
          router.push('/admin/review');
        }
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit review');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMoveQueue() {
    if (!data) return;
    const targetStage = data.submission.stage === 'DESIGN' ? 'BUILD' : 'DESIGN';
    try {
      const res = await fetch(`/api/reviews/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetStage }),
      });
      if (res.ok) {
        setMoveConfirm(false);
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to move queue');
      }
    } catch {
      alert('Failed to move queue');
    }
  }

  async function skipToNext() {
    fetch(`/api/reviews/${id}/claim`, { method: 'DELETE' }).catch(() => {});
    try {
      const res = await fetch('/api/reviews?limit=10');
      if (res.ok) {
        const { items } = await res.json();
        const next = items.find((p: { id: string }) => p.id !== id);
        if (next) {
          router.push(`/admin/review/${next.id}`);
          return;
        }
      }
    } catch {}
    router.push('/admin/review');
  }

  async function markAsFraud() {
    if (!data) return;
    if (!confirm('Are you sure you want to mark this user as fraud? This will suspend their account.')) return;
    setFlaggingFraud(true);
    try {
      const res = await fetch(`/api/admin/users/${data.submission.project.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fraudConvicted: true }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to flag user as fraud');
      }
    } finally {
      setFlaggingFraud(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-brown-800">Loading submission...</p>
      </div>
    );
  }

  const { submission, conflicts, hackatimeTrustLevel, isAdmin, reviewerId } = data;
  const project = submission.project;
  const tierInfo = project.tier ? getTierById(project.tier) : null;
  const claimedByOther = submission.claimedByOther;
  const claimExpiry = submission.claim ? new Date(submission.claim.expiresAt) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── Claim Warning Banner ── */}
      {claimedByOther && (
        <div className="bg-red-50 border-2 border-red-300 p-4 flex items-center justify-between">
          <div>
            <p className="text-red-800 font-medium text-sm uppercase">Claimed by another reviewer</p>
            {claimExpiry && (
              <p className="text-red-700 text-xs mt-1">
                Expires: {claimExpiry.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={skipToNext}
            className="px-3 py-1.5 text-xs uppercase border border-red-500 text-red-500 hover:bg-red-500/10 cursor-pointer"
          >
            Skip to Next
          </button>
        </div>
      )}

      {/* ── Fraud / Trust Warning ── */}
      {project.user.fraudConvicted && showFraudWarning && (
        <div className="bg-red-100 border-2 border-red-500 p-6 relative">
          <button
            onClick={() => setShowFraudWarning(false)}
            className="absolute top-2 right-3 text-red-400 hover:text-red-600 text-lg cursor-pointer"
          >
            ×
          </button>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">⚠️</span>
            <h2 className="text-red-800 text-lg uppercase tracking-wider font-bold">Fraud Alert</h2>
          </div>
          <p className="text-red-700 text-sm">
            This user has been flagged for fraud. Their account is suspended. Exercise extreme caution when reviewing this submission.
          </p>
        </div>
      )}

      {hackatimeTrustLevel === 'red' && !project.user.fraudConvicted && (
        <div className="bg-red-50 border-2 border-red-300 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔴</span>
              <div>
                <p className="text-red-800 font-medium text-sm uppercase">Hackatime Trust: Convicted</p>
                <p className="text-red-700 text-xs mt-1">This user has been convicted on Hackatime for fraud. They should be marked as fraud on this platform too.</p>
              </div>
            </div>
            <button
              onClick={markAsFraud}
              disabled={flaggingFraud}
              className="px-3 py-1.5 text-xs uppercase bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {flaggingFraud ? 'Flagging...' : 'Mark as Fraud'}
            </button>
          </div>
        </div>
      )}

      {/* ── Navigation Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Link
            href="/admin/review"
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-400 text-brown-800 hover:border-orange-500 transition-colors"
          >
            Back
          </Link>
          <button
            onClick={skipToNext}
            className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-400 text-brown-800 hover:border-orange-500 transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>
        <div className="flex gap-2">
          {project.githubRepo && (
            <a
              href={project.githubRepo}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs uppercase tracking-wider border border-cream-400 text-brown-800 hover:border-orange-500 transition-colors"
            >
              GitHub Repo
            </a>
          )}
          {isAdmin && (
            <div className="relative">
              <button
                onClick={() => setMoveConfirm(!moveConfirm)}
                className="px-3 py-1.5 text-xs uppercase tracking-wider border border-orange-500 text-orange-500 hover:bg-orange-500/10 cursor-pointer"
              >
                Move to {submission.stage === 'DESIGN' ? 'Build' : 'Design'} Queue
              </button>
              {moveConfirm && (
                <div className="absolute right-0 top-full mt-1 bg-cream-100 border-2 border-orange-500 p-3 z-10 w-64">
                  <p className="text-brown-800 text-xs mb-2">Move this submission to the {submission.stage === 'DESIGN' ? 'Build' : 'Design'} queue?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleMoveQueue}
                      className="px-2 py-1 text-xs bg-orange-500 text-white hover:bg-orange-600 cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setMoveConfirm(false)}
                      className="px-2 py-1 text-xs border border-cream-400 text-brown-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Submission Overview Card ── */}
      <div className="bg-cream-100 border-2 border-cream-400 overflow-hidden">
        {project.coverImage && (
          <div className="w-full h-48 overflow-hidden border-b border-cream-400">
            <img src={project.coverImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-cream-600 text-xs uppercase tracking-wider">{submission.id}</p>
              <h1 className="text-brown-800 text-2xl uppercase tracking-wide">{project.title}</h1>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <span className={`text-xs uppercase px-2 py-0.5 ${
                submission.stage === 'DESIGN' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
              }`}>
                {submission.stage}
              </span>
              {tierInfo && (
                <span className={`text-xs px-2 py-0.5 ${
                  { 1: 'bg-gray-200 text-gray-800', 2: 'bg-green-200 text-green-800', 3: 'bg-blue-200 text-blue-800', 4: 'bg-purple-200 text-purple-800', 5: 'bg-orange-200 text-orange-800' }[project.tier!] || ''
                }`}>
                  {tierInfo.name} ({tierInfo.bits} bits)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            {project.user.image && (
              <img src={project.user.image} alt="" className="w-8 h-8 rounded-full" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-brown-800 text-sm">{project.user.name || project.user.email}</p>
                {project.user.fraudConvicted ? (
                  <span className="text-xs px-2 py-0.5 bg-red-600 text-white uppercase">Fraud</span>
                ) : hackatimeTrustLevel === 'red' ? (
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 border border-red-300 uppercase">Convicted</span>
                ) : hackatimeTrustLevel === 'green' ? (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 border border-green-300 uppercase">Trusted</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 bg-cream-200 text-cream-700 border border-cream-400 uppercase">Unscored</span>
                )}
              </div>
              <p className="text-cream-600 text-xs">
                Submitted {new Date(submission.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mb-4 text-sm">
            <div>
              <p className="text-cream-600 text-xs uppercase">Work Units</p>
              <p className="text-brown-800">{project.totalWorkUnits}h</p>
            </div>
            <div>
              <p className="text-cream-600 text-xs uppercase">Entries</p>
              <p className="text-brown-800">{project.entryCount}</p>
            </div>
            <div>
              <p className="text-cream-600 text-xs uppercase">BOM Cost</p>
              <p className="text-brown-800">${project.bomCost.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-cream-600 text-xs uppercase">BOM $/h</p>
              <p className="text-brown-800">{project.costPerHour !== null ? `$${project.costPerHour.toFixed(2)}` : '—'}</p>
            </div>
            <div>
              <p className="text-cream-600 text-xs uppercase">Bits/h</p>
              <p className="text-orange-500">{project.bitsPerHour !== null ? project.bitsPerHour : '—'}</p>
            </div>
            <div>
              <p className="text-cream-600 text-xs uppercase">Funding</p>
              <p className="text-brown-800">{tierInfo ? `${tierInfo.bits} bits` : 'No tier'}</p>
            </div>
          </div>

          {project.description && (
            <div className="mb-4">
              <p className="text-cream-600 text-xs uppercase mb-1">Description</p>
              <p className="text-brown-800 text-sm whitespace-pre-wrap">{project.description}</p>
            </div>
          )}

          {project.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {project.tags.map((tag) => (
                <span key={tag} className="text-xs bg-cream-200 text-brown-800 px-2 py-0.5">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── GitHub Checks Card ── */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <h2 className="text-brown-800 text-sm uppercase tracking-wider mb-4">GitHub Repo Checks</h2>
        {ghChecksLoading ? (
          <p className="text-cream-600 text-sm">Running checks...</p>
        ) : ghChecks ? (
          <div className="space-y-2">
            {ghChecks.map((check) => (
              <div key={check.key} className="flex items-center gap-2 text-sm">
                <span className={check.passed ? 'text-green-600' : 'text-red-500'}>
                  {check.passed ? '\u2713' : '\u2717'}
                </span>
                <span className="text-brown-800">{check.label}</span>
                {check.detail && (
                  <span className="text-cream-600 text-xs">({check.detail})</span>
                )}
              </div>
            ))}
          </div>
        ) : ghChecksError ? (
          <p className="text-red-500 text-sm">Error: {ghChecksError}</p>
        ) : (
          <p className="text-cream-600 text-sm">Could not load checks</p>
        )}
      </div>

      {/* ── Conflict Warning Card ── */}
      {conflicts.length > 0 && (
        <div className="bg-yellow-50 border-2 border-yellow-300 p-4">
          <p className="text-yellow-800 font-medium text-sm uppercase mb-2">
            Conflict: Author has other active submissions
          </p>
          <ul className="space-y-1">
            {conflicts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/review/${c.id}`}
                  className="text-yellow-700 text-sm hover:underline"
                >
                  {c.project.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Previous Reviews Card ── */}
      {submission.reviews.length > 0 && (
        <div className="bg-cream-100 border-2 border-cream-400 p-6">
          <h2 className="text-brown-800 text-sm uppercase tracking-wider mb-4">Previous Reviews</h2>
          <div className="space-y-4">
            {submission.reviews.map((review, idx) => {
              const isLatest = idx === 0 && !review.invalidated;
              const defaultExpanded = isLatest;

              return (
                <ReviewCard key={review.id} review={review} defaultExpanded={defaultExpanded} />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Note from Submitter Card ── */}
      {submission.notes && (
        <div className="bg-cream-100 border-2 border-cream-400 p-6">
          <h2 className="text-brown-800 text-sm uppercase tracking-wider mb-2">Note from Submitter</h2>
          <p className="text-brown-800 text-sm whitespace-pre-wrap">{submission.notes}</p>
        </div>
      )}

      {/* ── Work Log / Journal Card ── */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <h2 className="text-brown-800 text-sm uppercase tracking-wider mb-4">Work Log</h2>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 text-sm">
          <div>
            <p className="text-cream-600 text-xs uppercase">Entries</p>
            <p className="text-brown-800 font-medium">{project.entryCount}</p>
          </div>
          <div>
            <p className="text-cream-600 text-xs uppercase">Journal</p>
            <p className="text-brown-800 font-medium">{project.journalHours}h</p>
          </div>
          <div>
            <p className="text-cream-600 text-xs uppercase">Average</p>
            <p className="text-brown-800 font-medium">{project.avgWorkUnits}h</p>
          </div>
          <div>
            <p className="text-cream-600 text-xs uppercase">Max</p>
            <p className="text-brown-800 font-medium">{project.maxWorkUnits}h</p>
          </div>
          <div>
            <p className="text-cream-600 text-xs uppercase">Min</p>
            <p className="text-brown-800 font-medium">{project.minWorkUnits}h</p>
          </div>
        </div>

        {/* Firmware Time from Hackatime */}
        {project.hackatimeProjects.length > 0 && (
          <div className="mb-4 bg-cream-200 border border-cream-300 p-3">
            <p className="text-cream-600 text-xs uppercase mb-2">Firmware Time (Hackatime)</p>
            <div className="space-y-1">
              {project.hackatimeProjects.map((hp) => (
                <div key={hp.id} className="flex items-center justify-between text-sm">
                  <span className="text-brown-800">{hp.hackatimeProject}</span>
                  <span className="text-brown-800">
                    {(hp.totalSeconds / 3600).toFixed(1)}h
                    {hp.hoursApproved !== null && (
                      <span className="text-green-700 ml-2">({hp.hoursApproved}h approved)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-brown-800 text-sm mt-2">
              Firmware total: <span className="font-medium">{project.firmwareHours}h</span>
              <span className="text-cream-600 ml-2">(included in {project.totalWorkUnits}h total)</span>
            </p>
          </div>
        )}

        {/* Bar Chart */}
        {project.workSessions.length > 0 && (
          <div className="mb-4">
            <div className="flex items-end gap-1 h-24">
              {project.workSessions.map((session) => {
                const maxH = project.maxWorkUnits || 1;
                const heightPct = (session.hoursClaimed / maxH) * 100;
                return (
                  <div
                    key={session.id}
                    className="flex-1 bg-orange-400 hover:bg-orange-500 transition-colors relative group min-w-[4px]"
                    style={{ height: `${Math.max(heightPct, 4)}%` }}
                    title={`${session.title}: ${session.hoursClaimed}h`}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-brown-800 text-cream-100 text-xs px-2 py-1 hidden group-hover:block whitespace-nowrap z-10">
                      {session.hoursClaimed}h - {session.title}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsible full log */}
        <button
          onClick={() => setShowWorkLog(!showWorkLog)}
          className="text-orange-500 text-xs uppercase tracking-wider hover:text-orange-600 cursor-pointer"
        >
          {showWorkLog ? 'Hide Full Log' : 'Show Full Log'}
        </button>

        {showWorkLog && (
          <div className="mt-4 space-y-3">
            {project.workSessions.map((session) => (
              <div key={session.id} className="border border-cream-300 p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-brown-800 text-sm font-medium">{session.title}</p>
                    <p className="text-cream-600 text-xs">
                      {new Date(session.createdAt).toLocaleDateString()} | {session.hoursClaimed}h claimed
                      {session.hoursApproved !== null && ` | ${session.hoursApproved}h approved`}
                    </p>
                    {session.categories.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {session.categories.map((c) => (
                          <span key={c} className="text-xs bg-cream-200 text-brown-800 px-1">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {session.content && (
                  <p className="text-brown-800 text-xs mt-2 whitespace-pre-wrap">{session.content}</p>
                )}
                {session.media.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {session.media.map((m) => (
                      <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                        {m.type === 'IMAGE' ? (
                          <img src={m.url} alt="" className="w-20 h-20 object-cover border border-cream-300" />
                        ) : (
                          <span className="text-xs text-orange-500 underline">Video</span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Supporting Evidence Card ── */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <h2 className="text-brown-800 text-sm uppercase tracking-wider mb-4">Supporting Evidence</h2>
        <div className="flex gap-6 text-sm mb-3">
          <p className="text-brown-800">
            BOM Cost: <span className="font-medium">${project.bomCost.toFixed(2)}</span>
          </p>
          <p className="text-brown-800">
            $/h: <span className="font-medium">{project.costPerHour !== null ? `$${project.costPerHour.toFixed(2)}` : '—'}</span>
          </p>
          <p className="text-brown-800">
            Bits/h: <span className="font-medium text-orange-500">{project.bitsPerHour !== null ? project.bitsPerHour : '—'}</span>
          </p>
        </div>

        {/* BOM Items */}
        {project.bomItems.length > 0 && (
          <div className="mb-4">
            <p className="text-cream-600 text-xs uppercase mb-2">Bill of Materials</p>
            <div className="space-y-1">
              {project.bomItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm border-b border-cream-300 py-1">
                  <div>
                    <span className="text-brown-800">{item.name}</span>
                    {item.purpose && <span className="text-cream-600 text-xs ml-2">({item.purpose})</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-brown-800">${(item.costPerItem * item.quantity).toFixed(2)}</span>
                    <span className={`text-xs px-1 ${
                      item.status === 'approved' ? 'bg-green-100 text-green-800' :
                      item.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cart Screenshots */}
        {project.cartScreenshots.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {project.cartScreenshots.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`Cart screenshot ${i + 1}`} className="w-full h-32 object-cover border border-cream-300" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-cream-600 text-sm">No screenshots uploaded</p>
        )}

        {/* Session media gallery */}
        {project.workSessions.some((s) => s.media.length > 0) && (
          <div className="mt-4">
            <p className="text-cream-600 text-xs uppercase mb-2">Session Media</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {project.workSessions.flatMap((s) =>
                s.media.filter((m) => m.type === 'IMAGE').map((m) => (
                  <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                    <img src={m.url} alt="" className="w-full h-24 object-cover border border-cream-300" />
                  </a>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Internal Notes Card ── */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <h2 className="text-brown-800 text-sm uppercase tracking-wider mb-2">
          Internal Notes <span className="text-cream-600 normal-case">(about this author, shared across reviewers)</span>
        </h2>
        <textarea
          value={internalNote}
          onChange={(e) => handleNoteChange(e.target.value)}
          className="w-full h-24 px-3 py-2 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500 resize-y"
          placeholder="Add notes about this author..."
        />
        <p className="text-cream-600 text-xs mt-1">Auto-saved</p>
      </div>

      {/* ── Submit Review Card ── */}
      <div className={`bg-cream-100 border-2 ${claimedByOther ? 'border-cream-400 opacity-60' : 'border-orange-500'} p-6`}>
        <h2 className="text-brown-800 text-sm uppercase tracking-wider mb-4">Submit Review</h2>

        {claimedByOther ? (
          <p className="text-cream-600 text-sm">This submission is claimed by another reviewer. You cannot submit a review.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-cream-600 text-xs uppercase block mb-1">Work Units Override</label>
                <input
                  type="number"
                  step="0.1"
                  value={workUnitsOverride}
                  onChange={(e) => setWorkUnitsOverride(e.target.value)}
                  placeholder={`Current: ${project.totalWorkUnits}h`}
                  className="w-full px-3 py-1.5 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-cream-600 text-xs uppercase block mb-1">Tier Override</label>
                <select
                  value={tierOverride}
                  onChange={(e) => setTierOverride(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500"
                >
                  <option value="">Current: {tierInfo?.name || 'None'}</option>
                  {TIERS.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.bits} bits, {t.minHours}-{t.maxHours === Infinity ? '67+' : t.maxHours}h)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-cream-600 text-xs uppercase block mb-1">Grant Override (bits)</label>
                <input
                  type="number"
                  value={grantOverride}
                  onChange={(e) => setGrantOverride(e.target.value)}
                  placeholder="Override grant amount"
                  className="w-full px-3 py-1.5 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500"
                />
                {grantOverride && (
                  <p className="text-cream-600 text-xs mt-1">{grantOverride} bits = ${grantOverride} value</p>
                )}
              </div>
              {isAdmin && (
                <div>
                  <label className="text-cream-600 text-xs uppercase block mb-1">Category Override (Admin)</label>
                  <select
                    value={categoryOverride}
                    onChange={(e) => setCategoryOverride(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500"
                  >
                    <option value="">No change</option>
                    <option value="DESIGN">Design</option>
                    <option value="BUILD">Build</option>
                  </select>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-cream-600 text-xs uppercase block mb-1">Internal Justification</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-20 px-3 py-2 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500 resize-y"
                placeholder="Internal reason for your decision (not shown to submitter)..."
              />
            </div>

            <div className="mb-4">
              <label className="text-cream-600 text-xs uppercase block mb-1">
                Feedback for Submitter <span className="text-red-500">*</span>
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="w-full h-24 px-3 py-2 text-sm border border-cream-400 bg-cream-50 text-brown-800 focus:outline-none focus:border-orange-500 resize-y"
                placeholder="Feedback visible to the submitter..."
                required
              />
            </div>

            {project.user.fraudConvicted && (
              <div className="mb-3 bg-red-50 border border-red-300 p-3">
                <p className="text-red-800 text-xs uppercase">Fraud-convicted user — only rejection is allowed</p>
              </div>
            )}

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => submitReview('APPROVED')}
                disabled={submitting || project.user.fraudConvicted}
                title={project.user.fraudConvicted ? 'Cannot approve fraud-convicted users' : undefined}
                className="px-4 py-2 text-sm uppercase tracking-wider bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Approve
              </button>
              <button
                onClick={() => submitReview('RETURNED')}
                disabled={submitting || project.user.fraudConvicted}
                title={project.user.fraudConvicted ? 'Cannot return fraud-convicted users' : undefined}
                className="px-4 py-2 text-sm uppercase tracking-wider bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Return
              </button>
              <button
                onClick={() => submitReview('REJECTED')}
                disabled={submitting}
                className="px-4 py-2 text-sm uppercase tracking-wider bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Permanently Reject
              </button>
              <button
                onClick={skipToNext}
                disabled={submitting}
                className="px-4 py-2 text-sm uppercase tracking-wider border border-cream-400 text-brown-800 hover:border-orange-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function ReviewCard({ review, defaultExpanded }: {
  review: ReviewData['submission']['reviews'][0];
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const resultColor = {
    APPROVED: 'text-green-700 bg-green-50 border-green-300',
    RETURNED: 'text-yellow-700 bg-yellow-50 border-yellow-300',
    REJECTED: 'text-red-700 bg-red-50 border-red-300',
  }[review.result] || '';

  const frozenTierInfo = review.frozenTier ? getTierById(review.frozenTier) : null;

  return (
    <div className={`border ${review.invalidated ? 'border-cream-300 opacity-60' : 'border-cream-400'} p-3`}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {review.invalidated && (
            <span className="text-xs px-1 bg-cream-300 text-cream-700 uppercase">Outdated</span>
          )}
          {review.isAdminReview && (
            <span className="text-xs px-1 bg-purple-100 text-purple-800 uppercase">Admin</span>
          )}
          <span className={`text-xs px-2 py-0.5 border ${resultColor}`}>
            {review.result}
          </span>
          {review.reviewerName && (
            <span className="text-brown-800 text-xs font-medium">by {review.reviewerName}</span>
          )}
          <span className="text-cream-600 text-xs">
            {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <span className="text-cream-600 text-xs">{expanded ? 'collapse' : 'expand'}</span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          {/* Overrides */}
          {(review.workUnitsOverride || review.tierOverride || review.grantOverride || review.categoryOverride) && (
            <div className="bg-cream-200 p-2">
              <p className="text-cream-600 text-xs uppercase mb-1">Overrides Applied</p>
              {review.workUnitsOverride !== null && <p className="text-brown-800 text-xs">Work Units: {review.workUnitsOverride}h</p>}
              {review.tierOverride !== null && <p className="text-brown-800 text-xs">Tier: {review.tierOverride}</p>}
              {review.grantOverride !== null && <p className="text-brown-800 text-xs">Grant: {review.grantOverride} bits</p>}
              {review.categoryOverride && <p className="text-brown-800 text-xs">Category: {review.categoryOverride}</p>}
            </div>
          )}

          {/* Feedback */}
          {review.feedback && (
            <div>
              <p className="text-cream-600 text-xs uppercase">Feedback (shown to submitter)</p>
              <p className="text-brown-800 whitespace-pre-wrap">{review.feedback}</p>
            </div>
          )}

          {/* Internal reason */}
          {review.reason && (
            <div>
              <p className="text-cream-600 text-xs uppercase">Internal Justification</p>
              <p className="text-brown-800 whitespace-pre-wrap">{review.reason}</p>
            </div>
          )}

          {/* Frozen snapshot */}
          <div className="bg-cream-200 p-2">
            <p className="text-cream-600 text-xs uppercase mb-1">Snapshot at Review Time</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {review.frozenWorkUnits !== null && (
                <div><span className="text-cream-600">Work Units:</span> <span className="text-brown-800">{review.frozenWorkUnits}h</span></div>
              )}
              {review.frozenEntryCount !== null && (
                <div><span className="text-cream-600">Entries:</span> <span className="text-brown-800">{review.frozenEntryCount}</span></div>
              )}
              {review.frozenFundingAmount !== null && (
                <div><span className="text-cream-600">Funding:</span> <span className="text-brown-800">${(review.frozenFundingAmount / 100).toFixed(2)}</span></div>
              )}
              {frozenTierInfo && (
                <div><span className="text-cream-600">Tier:</span> <span className="text-brown-800">{frozenTierInfo.name}</span></div>
              )}
            </div>
            {review.frozenReviewerNote && (
              <div className="mt-1">
                <span className="text-cream-600 text-xs">Note to reviewer:</span>
                <p className="text-brown-800 text-xs">{review.frozenReviewerNote}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
