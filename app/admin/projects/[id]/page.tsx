'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { StageProgress } from '@/app/components/projects/StageProgress';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const MDPreview = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default.Markdown),
  { ssr: false }
);
import { ProjectTag } from "@/app/generated/prisma/enums";
import { STARTER_PROJECT_NAMES } from "@/lib/starter-projects";
import { getTierById, TIERS } from "@/lib/tiers";
import { fixMarkdownImages } from '@/lib/markdown';
import { getBadgeImage } from "@/lib/badges";
import { formatPrice, bomItemTotal } from "@/lib/format";

type BadgeType = 
  | "I2C" | "SPI" | "WIFI" | "BLUETOOTH" | "OTHER_RF"
  | "ANALOG_SENSORS" | "DIGITAL_SENSORS" | "CAD" | "DISPLAYS" | "MOTORS"
  | "CAMERAS" | "METAL_MACHINING" | "WOOD_FASTENERS" | "MACHINE_LEARNING"
  | "MCU_INTEGRATION" | "FOUR_LAYER_PCB" | "SOLDERING";

interface SessionMedia {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
}

interface WorkSession {
  id: string;
  hoursClaimed: number;
  hoursApproved: number | null;
  reviewComments: string | null;
  content: string | null;
  createdAt: string;
  media: SessionMedia[];
  categories: string[];
  stage: "DESIGN" | "BUILD";
}

interface BOMItem {
  id: string;
  name: string;
  purpose: string;
  quantity: number | null;
  totalCost: number;
  link: string;
  distributor: string;
  status: "pending" | "approved" | "rejected";
  reviewComments: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

interface ProjectBadge {
  id: string;
  badge: BadgeType;
  claimedAt: string;
  grantedAt: string | null;
}

interface ProjectUser {
  id: string;
  name: string | null;
  email: string;
  verificationStatus: string | null;
  fraudConvicted: boolean;
}

interface ReviewAction {
  id: string;
  stage: "DESIGN" | "BUILD";
  decision: "APPROVED" | "CHANGE_REQUESTED" | "REJECTED";
  grantAmount: number | null;
  createdAt: string;
}

interface HackatimeProjectData {
  id: string;
  hackatimeProject: string;
  totalSeconds: number;
  hoursApproved: number | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

interface AdminProject {
  id: string;
  title: string;
  description: string | null;
  githubRepo: string | null;
  coverImage: string | null;
  tags: ProjectTag[];
  designStatus: string;
  designSubmissionNotes: string | null;
  designReviewComments: string | null;
  designReviewedAt: string | null;
  designReviewedBy: string | null;
  buildStatus: string;
  buildSubmissionNotes: string | null;
  buildReviewComments: string | null;
  buildReviewedAt: string | null;
  buildReviewedBy: string | null;
  isStarter: boolean;
  starterProjectId: string | null;
  tier: number | null;
  bomTax: number | null;
  bomShipping: number | null;
  cartScreenshots: string[];
  createdAt: string;
  submittedAt: string | null;
  user: ProjectUser;
  workSessions: WorkSession[];
  badges: ProjectBadge[];
  bomItems: BOMItem[];
  reviewActions: ReviewAction[];
  hiddenFromGallery: boolean;
  deletedAt: string | null;
  deletedBy: { id: string; name: string | null } | null;
  hackatimeProjects: HackatimeProjectData[];
  hackatimeTrustLevel: string | null;
}

const BADGE_LABELS: Record<BadgeType, string> = {
  I2C: "I2C",
  SPI: "SPI",
  WIFI: "WiFi",
  BLUETOOTH: "Bluetooth",
  OTHER_RF: "Other RF",
  ANALOG_SENSORS: "Analog Sensors",
  DIGITAL_SENSORS: "Digital Sensors",
  CAD: "CAD",
  DISPLAYS: "Displays",
  MOTORS: "Motors",
  CAMERAS: "Cameras",
  METAL_MACHINING: "Metal Machining",
  WOOD_FASTENERS: "Wood & Fasteners",
  MACHINE_LEARNING: "Machine Learning",
  MCU_INTEGRATION: "MCU Integration",
  FOUR_LAYER_PCB: "4-Layer PCB",
  SOLDERING: "Soldering",
};

interface SessionReviewState {
  hoursApproved: number;
  reviewComments: string;
  isReviewed: boolean;
}

export default function AdminProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<AdminProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionReviews, setSessionReviews] = useState<Record<string, SessionReviewState>>({});
  const [buildComments, setBuildComments] = useState('');
  const [buildGrantAmount, setBuildGrantAmount] = useState('');
  const [buildHoursJustification, setBuildHoursJustification] = useState('');
  const [justificationManuallyEdited, setJustificationManuallyEdited] = useState(false);
  const [buildAirtableGrantAmount, setBuildAirtableGrantAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [adminActioning, setAdminActioning] = useState(false);
  const [airtableSyncing, setAirtableSyncing] = useState(false);
  const [reviewingSession, setReviewingSession] = useState<string | null>(null);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  const [hackatimeReviews, setHackatimeReviews] = useState<Record<string, { hoursApproved: number; isReviewed: boolean }>>({});
  const [reviewingHackatime, setReviewingHackatime] = useState<string | null>(null);
  const [editGrantAmount, setEditGrantAmount] = useState('');
  const [editingGrant, setEditingGrant] = useState(false);
  const [savingGrant, setSavingGrant] = useState(false);
  const [showFraudWarning, setShowFraudWarning] = useState(true);
  const [flaggingFraud, setFlaggingFraud] = useState(false);
  const [ghChecks, setGhChecks] = useState<Array<{ key: string; label: string; passed: boolean; detail?: string }> | null>(null);
  const [ghChecksLoading, setGhChecksLoading] = useState(false);
  const [ghChecksError, setGhChecksError] = useState<string | null>(null);
  const [ghChecksOpen, setGhChecksOpen] = useState(false);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/admin/projects/${projectId}`);
        if (res.ok) {
          const data: AdminProject = await res.json();
          setProject(data);
          const initialReviews: Record<string, SessionReviewState> = {};
          data.workSessions.forEach((session) => {
            initialReviews[session.id] = {
              hoursApproved: session.hoursApproved ?? session.hoursClaimed,
              reviewComments: session.reviewComments ?? '',
              isReviewed: session.hoursApproved !== null,
            };
          });
          setSessionReviews(initialReviews);

          const initialHackatimeReviews: Record<string, { hoursApproved: number; isReviewed: boolean }> = {};
          (data.hackatimeProjects ?? []).forEach((hp: HackatimeProjectData) => {
            const totalHours = hp.totalSeconds / 3600;
            initialHackatimeReviews[hp.id] = {
              hoursApproved: hp.hoursApproved ?? Math.round(totalHours * 10) / 10,
              isReviewed: hp.hoursApproved !== null,
            };
          });
          setHackatimeReviews(initialHackatimeReviews);
        } else if (res.status === 404) {
          router.push('/admin');
        }
      } catch (error) {
        console.error('Failed to fetch project:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();

    fetch('/api/user/roles').then(r => r.json()).then(data => {
      setIsAdmin((data.roles as string[])?.includes('ADMIN'));
    }).catch(() => {});
  }, [projectId, router]);

  // Auto-generate hours justification from session reviews
  useEffect(() => {
    if (!project || justificationManuallyEdited) return;
    const sessions = project.workSessions;
    if (sessions.length === 0) return;

    const lines: string[] = [];
    let totalApproved = 0;
    let totalClaimed = 0;

    sessions.forEach((session, i) => {
      const review = sessionReviews[session.id];
      const approved = review?.hoursApproved ?? session.hoursClaimed;
      const claimed = session.hoursClaimed;
      totalApproved += approved;
      totalClaimed += claimed;

      const date = new Date(session.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      lines.push(`Session ${i + 1} (${date}) — ${approved}h approved of ${claimed}h claimed`);

      const justification = review?.reviewComments?.trim();
      if (justification) {
        lines.push(`Internal Justification: ${justification}`);
      }

      lines.push('');
    });

    lines.push(`Total: ${totalApproved}h approved of ${totalClaimed}h claimed`);

    setBuildHoursJustification(lines.join('\n').trim());
  }, [project, sessionReviews, justificationManuallyEdited]);

  const handleAdminAction = async (action: string) => {
    if (!project) return;
    const confirmMessages: Record<string, string> = {
      hide: 'Hide this project from the public gallery?',
      unhide: 'Unhide this project (make it visible in the gallery again)?',
      unapprove_design: 'Unapprove the design? This will reset design status to in_review and build status to draft.',
      unapprove_build: 'Unapprove the build? This will reset build status to in_review.',
      delete: 'Soft-delete this project? It will be hidden from all non-admin views.',
      undelete: 'Restore this project? It will become visible again.',
    };
    if (!confirm(confirmMessages[action] || `Perform action: ${action}?`)) return;

    setAdminActioning(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setProject(prev => prev ? { ...prev, ...data } : prev);
      } else {
        const data = await res.json();
        alert(data.error || 'Action failed');
      }
    } catch {
      alert('Action failed');
    } finally {
      setAdminActioning(false);
    }
  };

  const handleSyncToAirtable = async () => {
    if (!project) return;
    setAirtableSyncing(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/sync-to-airtable`, {
        method: 'POST',
      });
      if (res.ok) {
        alert('Synced to Airtable successfully');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to sync to Airtable');
      }
    } catch {
      alert('Failed to sync to Airtable');
    } finally {
      setAirtableSyncing(false);
    }
  };

  const handleSessionReview = async (sessionId: string) => {
    const review = sessionReviews[sessionId];
    if (!review) return;

    setReviewingSession(sessionId);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/sessions/${sessionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoursApproved: review.hoursApproved,
          reviewComments: review.reviewComments || null,
        }),
      });

      if (res.ok) {
        setSessionReviews((prev) => ({
          ...prev,
          [sessionId]: { ...prev[sessionId], isReviewed: true },
        }));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to review session');
      }
    } catch (error) {
      console.error('Failed to review session:', error);
      alert('Failed to review session');
    } finally {
      setReviewingSession(null);
    }
  };

  const handleHackatimeReview = async (hackatimeId: string) => {
    const review = hackatimeReviews[hackatimeId];
    if (!review) return;

    setReviewingHackatime(hackatimeId);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/hackatime/${hackatimeId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hoursApproved: review.hoursApproved }),
      });

      if (res.ok) {
        setHackatimeReviews((prev) => ({
          ...prev,
          [hackatimeId]: { ...prev[hackatimeId], isReviewed: true },
        }));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to review hackatime project');
      }
    } catch (error) {
      console.error('Failed to review hackatime project:', error);
      alert('Failed to review hackatime project');
    } finally {
      setReviewingHackatime(null);
    }
  };

  const handleUpdateGrant = async () => {
    if (!project) return;
    const amount = parseFloat(editGrantAmount);
    if (isNaN(amount) || amount < 0) {
      alert('Grant amount must be a non-negative number');
      return;
    }
    if (!confirm(`Update BOM grant to $${amount.toFixed(2)}?`)) return;
    setSavingGrant(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_grant', grantAmount: amount }),
      });
      if (res.ok) {
        setProject(prev => {
          if (!prev) return prev;
          const updatedActions = prev.reviewActions.map(a => {
            if (a.stage === 'DESIGN' && a.decision === 'APPROVED') {
              return { ...a, grantAmount: amount };
            }
            return a;
          });
          return { ...prev, reviewActions: updatedActions };
        });
        setEditingGrant(false);
        // Sync updated grant to Airtable
        try {
          await fetch(`/api/admin/projects/${projectId}/sync-to-airtable`, { method: 'POST' });
        } catch {
          // ignore — grant was saved, Airtable sync is best-effort
        }
        alert('Grant amount updated and synced to Airtable');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update grant amount');
      }
    } catch {
      alert('Failed to update grant amount');
    } finally {
      setSavingGrant(false);
    }
  };

  const handleStageDecision = async (stage: 'design' | 'build', decision: 'approved' | 'rejected') => {
    if (!project) return;

    const stageName = stage === 'design' ? 'Design' : 'Build';
    const confirmMessage = decision === 'approved' 
      ? `Are you sure you want to approve the ${stageName} stage?` 
      : `Are you sure you want to reject the ${stageName} stage?`;
    
    if (!confirm(confirmMessage)) return;

    setSubmitting(true);
    try {
      const requestBody: Record<string, unknown> = {
        stage,
        decision,
        reviewComments: buildComments || null,
      };

      const grantAmount = buildGrantAmount ? parseInt(buildGrantAmount, 10) : null;
      requestBody.grantAmount = decision === 'approved' ? grantAmount : null;
      requestBody.hoursJustification = decision === 'approved' ? (buildHoursJustification.trim() || null) : null;
      requestBody.airtableGrantAmount = decision === 'approved' ? (buildAirtableGrantAmount ? parseFloat(buildAirtableGrantAmount) : null) : null;

      const res = await fetch(`/api/admin/projects/${projectId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        router.push('/admin');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit decision');
      }
    } catch (error) {
      console.error('Failed to submit decision:', error);
      alert('Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBuildDecision = (decision: 'approved' | 'rejected') => handleStageDecision('build', decision);

  async function markAsFraud() {
    if (!project) return;
    if (!confirm('Are you sure you want to mark this user as fraud? This will suspend their account.')) return;
    setFlaggingFraud(true);
    try {
      const res = await fetch(`/api/admin/users/${project.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fraudConvicted: true }),
      });
      if (res.ok) {
        setProject(prev => prev ? { ...prev, user: { ...prev.user, fraudConvicted: true } } : prev);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to flag user as fraud');
      }
    } finally {
      setFlaggingFraud(false);
    }
  }

  const updateSessionReview = (sessionId: string, field: keyof SessionReviewState, value: number | string) => {
    setSessionReviews((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], [field]: value },
    }));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="loader" /></div>;
  }

  if (!project) {
    return null;
  }

  const totalHoursClaimed = project.workSessions.reduce((acc, s) => acc + s.hoursClaimed, 0);
  const allSessionsReviewed = Object.values(sessionReviews).every((r) => r.isReviewed);
  const isBuildInReview = project.buildStatus === 'in_review' || project.buildStatus === 'update_requested';
  const isAnyStageInReview = isBuildInReview;

  return (
    <>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/admin" className="text-cream-50 hover:text-orange-500 transition-colors text-sm flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Projects
        </Link>
      </div>

      <div className="max-w-4xl mx-auto">
          {/* ── Fraud / Trust Warning ── */}
          {project.user.fraudConvicted && showFraudWarning && (
            <div className="mb-6 bg-red-100 border-2 border-red-500 p-6 relative">
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

          {project.hackatimeTrustLevel === 'red' && !project.user.fraudConvicted && (
            <div className="mb-6 bg-red-50 border-2 border-red-300 p-4">
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

          {/* Deleted Banner */}
          {project.deletedAt && (
            <div className="mb-6 bg-red-100 border-2 border-red-500 p-4">
              <div className="flex items-center gap-2">
                <span className="text-red-800 font-bold text-sm uppercase tracking-wider">This project is deleted</span>
                <span className="text-red-600 text-xs">
                  — deleted on {new Date(project.deletedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {project.deletedBy?.name && ` by ${project.deletedBy.name}`}
                </span>
              </div>
            </div>
          )}

          {/* Stage Progress */}
          <div className="mb-6 bg-brown-800 border-2 border-cream-500/20 p-6">
            <StageProgress
              designStatus={project.designStatus as 'draft' | 'in_review' | 'approved' | 'rejected' | 'update_requested'}
              buildStatus={project.buildStatus as 'draft' | 'in_review' | 'approved' | 'rejected' | 'update_requested'}
              showMessages={false}
            />
          </div>

          {/* Project Header */}
          <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-orange-500 text-3xl uppercase tracking-wide">{project.title}</h1>
                {project.hiddenFromGallery && (
                  <span className="px-2 py-0.5 text-xs uppercase border border-gray-500 text-gray-500 bg-gray-500/10 self-center">Hidden</span>
                )}
              </div>
              <p className="text-cream-50 text-sm">
                by {project.user.name || project.user.email}
                {project.user.name && <span className="text-cream-200"> ({project.user.email})</span>}
                {project.user.fraudConvicted ? (
                  <span className="ml-2 text-xs bg-red-600 text-white px-2 py-0.5 uppercase">Fraud</span>
                ) : project.hackatimeTrustLevel === 'red' ? (
                  <span className="ml-2 text-xs bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 uppercase">Convicted</span>
                ) : project.hackatimeTrustLevel === 'green' ? (
                  <span className="ml-2 text-xs bg-green-100 text-green-800 border border-green-300 px-2 py-0.5 uppercase">Trusted</span>
                ) : (
                  <span className="ml-2 text-xs bg-brown-900 text-cream-700 border border-cream-500/20 px-2 py-0.5 uppercase">Unscored</span>
                )}
                {project.user.verificationStatus === 'verified' ? (
                  <span className="ml-2 text-xs bg-green-600 text-white px-2 py-0.5 uppercase">IDV Verified</span>
                ) : (
                  <span className="ml-2 text-xs bg-yellow-600 text-white px-2 py-0.5 uppercase">IDV {project.user.verificationStatus || 'Unknown'}</span>
                )}
              </p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2 shrink-0">
                {/* Hide / Unhide */}
                <button
                  onClick={() => handleAdminAction(project.hiddenFromGallery ? 'unhide' : 'hide')}
                  disabled={adminActioning}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition-colors cursor-pointer disabled:opacity-50 ${
                    project.hiddenFromGallery
                      ? 'bg-green-600/20 border-green-600 text-green-600 hover:bg-green-600/30'
                      : 'bg-brown-900 border-cream-500/20 text-cream-50 hover:bg-cream-500/10'
                  }`}
                >
                  {project.hiddenFromGallery ? 'Unhide from Gallery' : 'Hide from Gallery'}
                </button>
                {/* Unapprove design */}
                {project.designStatus === 'approved' && (
                  <button
                    onClick={() => handleAdminAction('unapprove_design')}
                    disabled={adminActioning}
                    className="px-3 py-1.5 text-xs uppercase tracking-wider border border-yellow-600 bg-yellow-600/10 text-yellow-600 hover:bg-yellow-600/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Unapprove Design
                  </button>
                )}
                {/* Unapprove build */}
                {project.buildStatus === 'approved' && (
                  <button
                    onClick={() => handleAdminAction('unapprove_build')}
                    disabled={adminActioning}
                    className="px-3 py-1.5 text-xs uppercase tracking-wider border border-yellow-600 bg-yellow-600/10 text-yellow-600 hover:bg-yellow-600/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Unapprove Build
                  </button>
                )}
                {/* Sync to Airtable */}
                {project.designStatus === 'approved' && (
                  <button
                    onClick={handleSyncToAirtable}
                    disabled={airtableSyncing}
                    className="px-3 py-1.5 text-xs uppercase tracking-wider border border-blue-600 bg-blue-600/10 text-blue-600 hover:bg-blue-600/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {airtableSyncing ? 'Syncing...' : 'Sync to Airtable'}
                  </button>
                )}
                {/* Delete / Undelete */}
                <button
                  onClick={() => handleAdminAction(project.deletedAt ? 'undelete' : 'delete')}
                  disabled={adminActioning}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider border transition-colors cursor-pointer disabled:opacity-50 ${
                    project.deletedAt
                      ? 'bg-green-600/20 border-green-600 text-green-600 hover:bg-green-600/30'
                      : 'bg-red-600/10 border-red-600 text-red-600 hover:bg-red-600/20'
                  }`}
                >
                  {project.deletedAt ? 'Undelete Project' : 'Delete Project'}
                </button>
              </div>
            )}
          </div>

          {/* Cover Image */}
          {project.coverImage && (
            <div className="mb-6">
              <a href={project.coverImage} target="_blank" rel="noopener noreferrer">
                <img
                  src={project.coverImage}
                  alt={project.title}
                  className="w-full max-h-96 object-cover border-2 border-cream-500/20 hover:border-orange-500 transition-colors bg-brown-800"
                />
              </a>
            </div>
          )}

          {/* Project Details */}
          <div className="bg-brown-800 border-2 border-cream-500/20 p-4 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <p className="text-cream-50 text-xs uppercase mb-1">Total Hours Logged</p>
                <p className="text-cream-50 text-xl">{totalHoursClaimed.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-cream-50 text-xs uppercase mb-1">Sessions</p>
                <p className="text-cream-50 text-xl">{project.workSessions.length}</p>
              </div>
              {project.hackatimeProjects && project.hackatimeProjects.length > 0 && (
                <div>
                  <p className="text-cream-50 text-xs uppercase mb-1">Firmware Time</p>
                  <p className="text-cream-50 text-xl">
                    {(project.hackatimeProjects.reduce((sum, p) => sum + p.totalSeconds, 0) / 3600).toFixed(1)}h
                  </p>
                </div>
              )}
              <div>
                <p className="text-cream-50 text-xs uppercase mb-1">Complexity Level</p>
                {project.tier ? (() => {
                  const tier = getTierById(project.tier);
                  return tier ? (
                    <div>
                      <p className="text-cream-50 text-xl">{tier.name}</p>
                      <p className="text-cream-200 text-xs">{tier.bits}&nbsp;bits · {tier.minHours}{tier.maxHours === Infinity ? '+' : `–${tier.maxHours}`}h</p>
                    </div>
                  ) : (
                    <p className="text-cream-50 text-xl">Tier {project.tier}</p>
                  );
                })() : (
                  <p className="text-cream-200 text-xl">—</p>
                )}
              </div>
              <div>
                <p className="text-cream-50 text-xs uppercase mb-1">Design Status</p>
                <p className={`text-xl uppercase ${
                  project.designStatus === 'approved' ? 'text-green-600' :
                  project.designStatus === 'rejected' ? 'text-red-600' :
                  project.designStatus === 'in_review' ? 'text-orange-500' :
                  project.designStatus === 'update_requested' ? 'text-blue-500' :
                  'text-cream-50'
                }`}>{project.designStatus.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-cream-50 text-xs uppercase mb-1">Build Status</p>
                <p className={`text-xl uppercase ${
                  project.buildStatus === 'approved' ? 'text-green-600' :
                  project.buildStatus === 'rejected' ? 'text-red-600' :
                  project.buildStatus === 'in_review' ? 'text-orange-500' :
                  project.buildStatus === 'update_requested' ? 'text-blue-500' :
                  'text-cream-50'
                }`}>{project.buildStatus.replace('_', ' ')}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-cream-50 text-xs uppercase mb-1">Created</p>
              <p className="text-cream-50 text-sm">
                {new Date(project.createdAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </p>
            </div>

            {project.isStarter && (
              <div className="mt-4">
                <span className="bg-orange-500/20 border border-orange-500/50 text-orange-500 px-2 py-1 text-xs uppercase">
                  {project.starterProjectId ? `Starter: ${STARTER_PROJECT_NAMES[project.starterProjectId] ?? project.starterProjectId}` : 'Starter Project'}
                </span>
              </div>
            )}

            {project.description && (
              <div className="mt-4">
                <p className="text-cream-50 text-xs uppercase mb-1">Description</p>
                <p className="text-cream-50 text-sm whitespace-pre-wrap">{project.description}</p>
              </div>
            )}

            {project.githubRepo && (
              <div className="mt-4">
                <p className="text-cream-50 text-xs uppercase mb-1">GitHub Repository</p>
                <div className="flex items-center gap-3">
                  <a
                    href={project.githubRepo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:text-orange-400 text-sm break-all"
                  >
                    {project.githubRepo}
                  </a>
                  <button
                    onClick={() => {
                      if (ghChecksOpen && ghChecks) {
                        setGhChecksOpen(false);
                        return;
                      }
                      setGhChecksOpen(true);
                      setGhChecksLoading(true);
                      setGhChecksError(null);
                      fetch(`/api/reviews/${projectId}/checks`, { cache: 'no-store' })
                        .then(async (res) => {
                          const d = await res.json();
                          if (res.ok && d.checks) setGhChecks(d.checks);
                          else setGhChecksError(d.error || d.detail || `HTTP ${res.status}`);
                        })
                        .catch((err) => setGhChecksError(String(err)))
                        .finally(() => setGhChecksLoading(false));
                    }}
                    className="shrink-0 px-2 py-1 text-xs uppercase bg-brown-900 border border-cream-500/20 text-cream-50 hover:bg-brown-800 transition-colors"
                  >
                    {ghChecksOpen ? (ghChecksLoading ? 'Checking...' : 'Hide Checks') : 'Run Repo Checks'}
                  </button>
                </div>
                {ghChecksOpen && (
                  <div className="mt-3 p-3 bg-brown-900 border border-cream-500/20 rounded">
                    {ghChecksLoading ? (
                      <p className="text-cream-200 text-sm">Running checks...</p>
                    ) : ghChecks ? (
                      <div className="space-y-1.5">
                        {ghChecks.map((check) => (
                          <div key={check.key} className="flex items-center gap-2 text-sm">
                            <span className={check.passed ? 'text-green-400' : 'text-red-400'}>
                              {check.passed ? '✓' : '✗'}
                            </span>
                            <span className="text-cream-50">{check.label}</span>
                            {check.detail && (
                              <span className="text-cream-200 text-xs">({check.detail})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : ghChecksError ? (
                      <div className="text-sm">
                        <p className="text-red-500">{ghChecksError}</p>
                        <button
                          onClick={() => {
                            setGhChecksLoading(true);
                            setGhChecksError(null);
                            fetch(`/api/reviews/${projectId}/checks`, { cache: 'no-store' })
                              .then(async (res) => {
                                const d = await res.json();
                                if (res.ok && d.checks) setGhChecks(d.checks);
                                else setGhChecksError(d.error || d.detail || `HTTP ${res.status}`);
                              })
                              .catch((err) => setGhChecksError(String(err)))
                              .finally(() => setGhChecksLoading(false));
                          }}
                          className="mt-2 text-orange-500 hover:text-orange-400 text-xs uppercase"
                        >
                          Retry
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )}


            {project.badges.length > 0 && (
              <div className="mt-4">
                <p className="text-cream-50 text-xs uppercase mb-2">Badges Claimed</p>
                <div className="flex flex-wrap gap-2">
                  {project.badges.map((badge) => (
                    <span 
                      key={badge.id}
                      className={`px-2 py-1 text-xs uppercase flex items-center gap-1.5 ${
                        badge.grantedAt 
                          ? 'bg-green-600/30 border border-green-600 text-green-600' 
                          : 'bg-brown-900 border border-cream-500/20 text-cream-50'
                      }`}
                    >
                      <img src={getBadgeImage(badge.badge)} alt="" className="w-6 h-6 object-contain" />
                      {BADGE_LABELS[badge.badge]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(project.designReviewedAt || project.buildReviewedAt) && (
              <div className="mt-4 pt-4 border-t border-cream-500/20 space-y-3">
                {project.designReviewedAt && (
                  <div>
                    <p className="text-cream-50 text-xs uppercase mb-1">Design Reviewed</p>
                    <p className="text-cream-50 text-sm">
                      {new Date(project.designReviewedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                      {project.designReviewedBy && ` by ${project.designReviewedBy}`}
                    </p>
                    {project.designReviewComments && (
                      <p className="text-cream-50 text-sm mt-1">{project.designReviewComments}</p>
                    )}
                  </div>
                )}
                {project.buildReviewedAt && (
                  <div>
                    <p className="text-cream-50 text-xs uppercase mb-1">Build Reviewed</p>
                    <p className="text-cream-50 text-sm">
                      {new Date(project.buildReviewedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                      {project.buildReviewedBy && ` by ${project.buildReviewedBy}`}
                    </p>
                    {project.buildReviewComments && (
                      <p className="text-cream-50 text-sm mt-1">{project.buildReviewComments}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Design Submission Notes */}
          {project.designSubmissionNotes && (
            <div className="bg-yellow-100 border-2 border-yellow-500/50 p-4 mb-6">
              <p className="text-yellow-700 text-xs uppercase mb-2">Design Submission Notes from User</p>
              <p className="text-cream-50 text-sm whitespace-pre-wrap">{project.designSubmissionNotes}</p>
            </div>
          )}

          {/* Build Submission Notes */}
          {project.buildSubmissionNotes && (
            <div className="bg-blue-100 border-2 border-blue-500/50 p-4 mb-6">
              <p className="text-blue-700 text-xs uppercase mb-2">Build Submission Notes from User</p>
              <p className="text-cream-50 text-sm whitespace-pre-wrap">{project.buildSubmissionNotes}</p>
            </div>
          )}

          {/* Work Sessions */}
          <div className="mb-8">
            <h2 className="text-cream-50 text-xl uppercase tracking-wide mb-4">Work Sessions</h2>
            {project.workSessions.length === 0 ? (
              <div className="bg-brown-800 border-2 border-cream-500/20 p-6 text-center">
                <p className="text-cream-50">No work sessions recorded</p>
              </div>
            ) : (
            <div className="space-y-4">
              {project.workSessions.map((session) => {
                const review = sessionReviews[session.id];
                const isReviewing = reviewingSession === session.id;

                return (
                  <div 
                    key={session.id} 
                    className={`bg-brown-800 border-2 p-4 ${
                      review?.isReviewed ? 'border-green-600/50' : 'border-cream-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs uppercase font-bold ${
                          session.stage === 'DESIGN' 
                            ? 'bg-purple-100 border border-yellow-500 text-yellow-500' 
                            : 'bg-cyan-100 border border-cyan-500 text-cyan-600'
                        }`}>
                          {session.stage}
                        </span>
                        <span className="text-cream-50 text-sm">
                          {new Date(session.createdAt).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <span className="bg-brown-900 border border-cream-500/20 text-cream-50 px-2 py-0.5 text-sm">
                          {session.hoursClaimed}h logged
                        </span>
                        {review?.isReviewed && (
                          <span className="bg-green-100 border border-green-600 text-green-600 px-2 py-0.5 text-sm">
                            ✓ Reviewed
                          </span>
                        )}
                      </div>
                    </div>

                    {session.categories && session.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {session.categories.map((cat, i) => (
                          <span key={i} className="bg-brown-900 text-cream-50 px-2 py-0.5 text-xs">
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}

                    {session.content ? (
                      <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-cream-50 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-500/20 [&_.wmde-markdown_img]:my-2 [&_.wmde-markdown_p]:my-1 mb-4" data-color-mode="light">
                        <MDPreview source={fixMarkdownImages(session.content)} />
                      </div>
                    ) : (
                      <p className="text-cream-50 text-sm italic mb-4">No content recorded</p>
                    )}

                    {/* Session Review Form - only show if any stage is in review */}
                    {isAnyStageInReview ? (
                      <div className="bg-brown-900 border border-cream-500/20 p-3 mt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className="text-cream-50 text-xs uppercase block mb-1">
                              Hours Approved
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={session.hoursClaimed}
                              step="0.5"
                              value={review?.hoursApproved ?? session.hoursClaimed}
                              onChange={(e) => updateSessionReview(session.id, 'hoursApproved', parseFloat(e.target.value) || 0)}
                              className="w-full bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                            />
                          </div>
                          <div className="flex items-end">
                            <span className="text-cream-50 text-sm pb-2">
                              of {session.hoursClaimed}h logged
                            </span>
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="text-cream-50 text-xs uppercase block mb-1">
                            Review Comments (optional)
                          </label>
                          <textarea
                            value={review?.reviewComments ?? ''}
                            onChange={(e) => updateSessionReview(session.id, 'reviewComments', e.target.value)}
                            rows={2}
                            className="w-full bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
                            placeholder="Add feedback for this session..."
                          />
                        </div>
                        <button
                          onClick={() => handleSessionReview(session.id)}
                          disabled={isReviewing}
                          className={`w-full py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer ${
                            review?.isReviewed 
                              ? 'bg-green-100 border border-green-600 text-green-600 hover:bg-green-200' 
                              : 'bg-orange-500 hover:bg-orange-400 text-white'
                          }`}
                        >
                          {isReviewing ? 'Saving...' : review?.isReviewed ? 'Update Review' : 'Review Session'}
                        </button>
                      </div>
                    ) : session.hoursApproved !== null && (
                      <div className="bg-brown-900 border border-cream-500/20 p-3 mt-4">
                        <div className="flex items-center justify-between">
                          <span className="text-cream-50 text-sm">Hours Approved: <span className="text-cream-50">{session.hoursApproved}h</span></span>
                          {session.reviewComments && (
                            <span className="text-cream-50 text-sm">{session.reviewComments}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* Firmware Time (Hackatime) */}
          {project.hackatimeProjects && project.hackatimeProjects.length > 0 && (
            <div className="mb-8">
              <h2 className="text-cream-50 text-xl uppercase tracking-wide mb-4">Firmware Time (Hackatime)</h2>
              <div className="space-y-3">
                {project.hackatimeProjects.map((hp) => {
                  const totalHours = hp.totalSeconds / 3600;
                  const review = hackatimeReviews[hp.id];
                  const isReviewing = reviewingHackatime === hp.id;

                  return (
                    <div
                      key={hp.id}
                      className={`bg-brown-800 border-2 p-4 ${
                        review?.isReviewed ? 'border-green-600/50' : 'border-cream-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-cream-50 font-medium">{hp.hackatimeProject}</span>
                          <span className="bg-brown-900 border border-cream-500/20 text-cream-50 px-2 py-0.5 text-sm">
                            {totalHours.toFixed(1)}h tracked
                          </span>
                          {review?.isReviewed && (
                            <span className="bg-green-100 border border-green-600 text-green-600 px-2 py-0.5 text-sm">
                              ✓ Reviewed
                            </span>
                          )}
                        </div>
                      </div>

                      {isAnyStageInReview ? (
                        <div className="bg-brown-900 border border-cream-500/20 p-3 mt-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                            <div>
                              <label className="text-cream-50 text-xs uppercase block mb-1">
                                Hours Approved
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={review?.hoursApproved ?? totalHours.toFixed(1)}
                                onChange={(e) =>
                                  setHackatimeReviews((prev) => ({
                                    ...prev,
                                    [hp.id]: { ...prev[hp.id], hoursApproved: parseFloat(e.target.value) || 0 },
                                  }))
                                }
                                className="w-full bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex items-end">
                              <span className="text-cream-50 text-sm pb-2">
                                of {totalHours.toFixed(1)}h tracked
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleHackatimeReview(hp.id)}
                            disabled={isReviewing}
                            className={`w-full py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer ${
                              review?.isReviewed
                                ? 'bg-green-100 border border-green-600 text-green-600 hover:bg-green-200'
                                : 'bg-orange-500 hover:bg-orange-400 text-white'
                            }`}
                          >
                            {isReviewing ? 'Saving...' : review?.isReviewed ? 'Update Review' : 'Review Firmware Time'}
                          </button>
                        </div>
                      ) : hp.hoursApproved !== null && (
                        <div className="bg-brown-900 border border-cream-500/20 p-3 mt-2">
                          <span className="text-cream-50 text-sm">
                            Hours Approved: <span className="text-cream-50">{hp.hoursApproved}h</span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="bg-brown-800 border-2 border-cream-500/20 p-3">
                  <span className="text-cream-50 text-sm">
                    Total firmware time:{' '}
                    <span className="text-cream-50 font-medium">
                      {(project.hackatimeProjects.reduce((sum, p) => sum + p.totalSeconds, 0) / 3600).toFixed(1)}h
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Bill of Materials */}
          {project.bomItems && project.bomItems.length > 0 && (
            <div className="mb-8">
              <h2 className="text-cream-50 text-xl uppercase tracking-wide mb-4">Bill of Materials</h2>
              
              {/* Cost Summary */}
              {(() => {
                const totalCost = project.bomItems.reduce((sum, item) => sum + bomItemTotal(item), 0) + (project.bomTax ?? 0) + (project.bomShipping ?? 0);
                const approvedCost = project.bomItems
                  .filter((item) => item.status === 'approved')
                  .reduce((sum, item) => sum + bomItemTotal(item), 0) + (project.bomTax ?? 0) + (project.bomShipping ?? 0);
                const costPerHour = totalHoursClaimed > 0 ? totalCost / totalHoursClaimed : null;
                const tier = project.tier ? getTierById(project.tier) : null;
                const bomGrant = project.reviewActions.find(
                  (a) => a.stage === "DESIGN" && a.decision === "APPROVED"
                )?.grantAmount ?? 0;
                const netBits = tier ? Math.max(0, tier.bits - Math.round(bomGrant)) : null;
                const bitsPerHour = netBits !== null && totalHoursClaimed > 0 ? netBits / totalHoursClaimed : null;
                return (
                  <div className="bg-brown-800 border-2 border-cream-500/20 p-4 mb-4">
                    <div className="flex gap-6 flex-wrap">
                      <div>
                        <p className="text-cream-50 text-xs uppercase mb-1">Total Estimated</p>
                        <p className="text-cream-50 text-lg">${formatPrice(totalCost)}</p>
                      </div>
                      <div>
                        <p className="text-cream-50 text-xs uppercase mb-1">Approved</p>
                        <p className="text-green-600 text-lg">${formatPrice(approvedCost)}</p>
                      </div>
                      <div>
                        <p className="text-cream-50 text-xs uppercase mb-1">Cost / Hour</p>
                        <p className="text-cream-50 text-lg">
                          {costPerHour !== null ? `$${formatPrice(costPerHour)}/h` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-cream-50 text-xs uppercase mb-1">Bits / Hour</p>
                        <p className="text-orange-500 text-lg">
                          {bitsPerHour !== null ? `${bitsPerHour.toFixed(1)}/h` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* BOM Table */}
              <div className="bg-brown-800 border-2 border-cream-500/20 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-500/20">
                      <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Name</th>
                      <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Purpose</th>
                      <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Cost</th>
                      <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Qty</th>
                      <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Total</th>
                      <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Link</th>
                      <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Distributor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.bomItems.map((item) => (
                      <tr key={item.id} className="border-b border-cream-500/20 last:border-b-0">
                        <td className="text-cream-50 px-4 py-3">{item.name}</td>
                        <td className="text-cream-50 px-4 py-3">{item.purpose}</td>
                        <td className="text-cream-50 text-right px-4 py-3">{item.quantity ?? '-'}</td>
                        <td className="text-cream-50 text-right px-4 py-3">${formatPrice(item.totalCost)}</td>
                        <td className="px-4 py-3">
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-orange-500 hover:text-orange-400 underline"
                          >
                            View
                          </a>
                        </td>
                        <td className="text-cream-50 px-4 py-3">{item.distributor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cart Screenshots */}
              {project.cartScreenshots && project.cartScreenshots.length > 0 && (
                <div className="mt-4">
                  <p className="text-cream-50 text-xs uppercase mb-2">Cart Screenshots</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {project.cartScreenshots.map((url, i) => (
                      <button key={i} type="button" onClick={() => setExpandedScreenshot(url)} className="block cursor-pointer">
                        <img src={url} alt={`Cart screenshot ${i + 1}`} className="w-full h-40 object-cover border-2 border-cream-500/20 hover:border-orange-500 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}


          {/* Build Approval Section - only show when design is approved */}
          {project.designStatus === 'approved' && (
            isBuildInReview ? (
              <div className="bg-cyan-50 border-2 border-cyan-500/50 p-6 mb-6">
                <h2 className="text-cream-50 text-xl uppercase tracking-wide mb-4">Build Approval</h2>
                
                {!allSessionsReviewed && (
                  <p className="text-yellow-600 text-sm mb-4">
                    ⚠ Review all sessions before making a decision
                  </p>
                )}

                {/* Bits preview */}
                <div className="mb-4 bg-brown-900 border border-cream-500/20 p-3">
                  <p className="text-cream-50 text-xs uppercase mb-1">Bits to be awarded</p>
                  {project.tier ? (() => {
                    const tier = getTierById(project.tier!);
                    const designAction = project.reviewActions.find(
                      (a) => a.stage === "DESIGN" && a.decision === "APPROVED"
                    );
                    const bomDeduction = Math.round(designAction?.grantAmount ?? 0);
                    const netBits = tier ? Math.max(0, tier.bits - bomDeduction) : 0;
                    return tier ? (
                      <div>
                        <p className="text-cream-50 font-medium">{netBits}&nbsp;bits</p>
                        <p className="text-cream-200 text-xs mt-0.5">
                          {tier.bits} ({tier.name}) − {bomDeduction} BOM grant = {netBits}&nbsp;bits net
                        </p>
                      </div>
                    ) : (
                      <p className="text-cream-200">Unknown complexity level</p>
                    );
                  })() : (
                    <p className="text-cream-200">— (no complexity level set; 0&nbsp;bits will be awarded)</p>
                  )}
                </div>

                <div className="mb-4">
                  <label className="text-cream-50 text-xs uppercase block mb-2">
                    Additional bits grant (optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={buildGrantAmount}
                      onChange={(e) => setBuildGrantAmount(e.target.value)}
                      className="w-32 bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="0"
                    />
                    <span className="text-cream-50 text-sm">bits</span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-cream-50 text-xs uppercase block mb-2">
                    Requested Grant Amount (optional, sent to Airtable)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-cream-50 text-sm">$</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={buildAirtableGrantAmount}
                      onChange={(e) => setBuildAirtableGrantAmount(e.target.value)}
                      className="w-32 bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-cream-50 text-xs uppercase block mb-2">
                    Build Review Comments (optional)
                  </label>
                  <textarea
                    value={buildComments}
                    onChange={(e) => setBuildComments(e.target.value)}
                    rows={3}
                    className="w-full bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
                    placeholder="Add feedback for the build stage..."
                  />
                </div>

                <div className="mb-4">
                  <label className="text-cream-50 text-xs uppercase block mb-2">
                    Hours Justification (sent to Airtable)
                  </label>
                  <textarea
                    value={buildHoursJustification}
                    onChange={(e) => {
                      setBuildHoursJustification(e.target.value);
                      setJustificationManuallyEdited(true);
                    }}
                    rows={6}
                    className="w-full bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-y"
                    placeholder="Auto-generated from session reviews..."
                  />
                  {justificationManuallyEdited && (
                    <button
                      type="button"
                      onClick={() => setJustificationManuallyEdited(false)}
                      className="text-orange-500 text-xs mt-1 hover:underline cursor-pointer"
                    >
                      Reset to auto-generated
                    </button>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleBuildDecision('rejected')}
                    disabled={submitting}
                    className="flex-1 bg-red-600/20 border-2 border-red-600 hover:bg-red-600/30 text-red-500 py-3 uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Reject Build'}
                  </button>
                  <button
                    onClick={() => handleBuildDecision('approved')}
                    disabled={submitting}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Approve Build'}
                  </button>
                </div>
              </div>
            ) : (project.buildStatus === 'approved' || project.buildStatus === 'rejected') && (
              <div className={`border-2 p-6 mb-6 ${
                project.buildStatus === 'approved' 
                  ? 'bg-green-600/10 border-green-600/50' 
                  : 'bg-red-600/10 border-red-600/50'
              }`}>
                <p className={`text-xl uppercase tracking-wide ${
                  project.buildStatus === 'approved' ? 'text-green-500' : 'text-red-500'
                }`}>
                  Build {project.buildStatus}
                </p>
              </div>
            )
          )}

          {/* BOM Grant editor — visible whenever design is approved */}
          {isAdmin && (() => {
            const designAction = project.reviewActions.find(
              (a) => a.stage === 'DESIGN' && a.decision === 'APPROVED'
            );
            if (!designAction) return null;
            return (
              <div className="bg-brown-800 border-2 border-cream-500/20 p-4 mb-6">
                <p className="text-cream-50 text-xs uppercase mb-2">BOM Grant (Design Approval)</p>
                {editingGrant ? (
                  <div className="flex items-center gap-2">
                    <span className="text-cream-50 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editGrantAmount}
                      onChange={(e) => setEditGrantAmount(e.target.value)}
                      className="w-32 bg-brown-800 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                    />
                    <button
                      onClick={handleUpdateGrant}
                      disabled={savingGrant}
                      className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {savingGrant ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingGrant(false)}
                      disabled={savingGrant}
                      className="text-cream-200 hover:text-cream-50 px-3 py-2 text-sm uppercase tracking-wider cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-cream-50">
                      ${(designAction.grantAmount ?? 0).toFixed(2)}
                    </p>
                    <button
                      onClick={() => {
                        setEditGrantAmount((designAction.grantAmount ?? 0).toString());
                        setEditingGrant(true);
                      }}
                      className="text-orange-500 text-xs hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
      </div>

      {/* Expanded Screenshot Overlay */}
      {expandedScreenshot && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 cursor-pointer" onClick={() => setExpandedScreenshot(null)}>
          <img src={expandedScreenshot} alt="Cart screenshot" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}
