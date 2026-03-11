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
import { getBadgeImage } from "@/lib/badges";
import { formatPrice } from "@/lib/format";

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
  costPerItem: number;
  quantity: number;
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
  cartScreenshots: string[];
  createdAt: string;
  submittedAt: string | null;
  user: ProjectUser;
  workSessions: WorkSession[];
  badges: ProjectBadge[];
  bomItems: BOMItem[];
  reviewActions: ReviewAction[];
  hiddenFromGallery: boolean;
  hackatimeProjects: HackatimeProjectData[];
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
  const [designComments, setDesignComments] = useState('');
  const [buildComments, setBuildComments] = useState('');
  const [designTier, setDesignTier] = useState<number | null>(null);
  const [designBomGrant, setDesignBomGrant] = useState('');
  const [buildGrantAmount, setBuildGrantAmount] = useState('');
  const [buildHoursJustification, setBuildHoursJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [adminActioning, setAdminActioning] = useState(false);
  const [airtableSyncing, setAirtableSyncing] = useState(false);
  const [reviewingSession, setReviewingSession] = useState<string | null>(null);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  const [hackatimeReviews, setHackatimeReviews] = useState<Record<string, { hoursApproved: number; isReviewed: boolean }>>({});
  const [reviewingHackatime, setReviewingHackatime] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/admin/projects/${projectId}`);
        if (res.ok) {
          const data: AdminProject = await res.json();
          setProject(data);
          setDesignTier(data.tier ?? null);

          // Pre-fill BOM grant from the latest approved design review action,
          // or fall back to total BOM cost as a starting suggestion
          const designApprovedAction = data.reviewActions.find(
            (a) => a.stage === "DESIGN" && a.decision === "APPROVED"
          );
          if (designApprovedAction?.grantAmount != null) {
            setDesignBomGrant(String(designApprovedAction.grantAmount));
          } else {
            const totalBomCost = data.bomItems.reduce(
              (sum, item) => sum + item.costPerItem * item.quantity, 0
            );
            if (totalBomCost > 0) setDesignBomGrant(String(Math.round(totalBomCost)));
          }

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

  const handleAdminAction = async (action: string) => {
    if (!project) return;
    const confirmMessages: Record<string, string> = {
      hide: 'Hide this project from the public gallery?',
      unhide: 'Unhide this project (make it visible in the gallery again)?',
      unapprove_design: 'Unapprove the design? This will reset design status to in_review and build status to draft.',
      unapprove_build: 'Unapprove the build? This will reset build status to in_review.',
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

  const handleStageDecision = async (stage: 'design' | 'build', decision: 'approved' | 'rejected') => {
    if (!project) return;

    const stageName = stage === 'design' ? 'Design' : 'Build';
    const confirmMessage = decision === 'approved' 
      ? `Are you sure you want to approve the ${stageName} stage?` 
      : `Are you sure you want to reject the ${stageName} stage?`;
    
    if (!confirm(confirmMessage)) return;

    setSubmitting(true);
    try {
      const reviewComments = stage === 'design' ? designComments : buildComments;

      const requestBody: Record<string, unknown> = {
        stage,
        decision,
        reviewComments: reviewComments || null,
      };

      if (stage === 'design') {
        requestBody.tier = decision === 'approved' ? designTier : undefined;
        const bomGrant = designBomGrant ? parseInt(designBomGrant, 10) : null;
        requestBody.grantAmount = decision === 'approved' ? bomGrant : null;
      } else {
        const grantAmount = buildGrantAmount ? parseInt(buildGrantAmount, 10) : null;
        requestBody.grantAmount = decision === 'approved' ? grantAmount : null;
        requestBody.hoursJustification = decision === 'approved' ? (buildHoursJustification.trim() || null) : null;
      }

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

  const handleDesignDecision = (decision: 'approved' | 'rejected') => handleStageDecision('design', decision);
  const handleBuildDecision = (decision: 'approved' | 'rejected') => handleStageDecision('build', decision);

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
  const isDesignInReview = project.designStatus === 'in_review' || project.designStatus === 'update_requested';
  const isBuildInReview = project.buildStatus === 'in_review' || project.buildStatus === 'update_requested';
  const isAnyStageInReview = isDesignInReview || isBuildInReview;

  return (
    <>
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/admin" className="text-brown-800 hover:text-orange-500 transition-colors text-sm flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Projects
        </Link>
      </div>

      <div className="max-w-4xl mx-auto">
          {/* Stage Progress */}
          <div className="mb-6 bg-cream-100 border-2 border-cream-400 p-6">
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
              <p className="text-brown-800 text-sm">
                by {project.user.name || project.user.email}
                {project.user.name && <span className="text-cream-600"> ({project.user.email})</span>}
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
                      : 'bg-cream-200 border-cream-400 text-brown-800 hover:bg-cream-300'
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
                  className="w-full max-h-96 object-cover border-2 border-cream-400 hover:border-orange-500 transition-colors bg-cream-100"
                />
              </a>
            </div>
          )}

          {/* Project Details */}
          <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div>
                <p className="text-brown-800 text-xs uppercase mb-1">Total Hours Logged</p>
                <p className="text-brown-800 text-xl">{totalHoursClaimed.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-brown-800 text-xs uppercase mb-1">Sessions</p>
                <p className="text-brown-800 text-xl">{project.workSessions.length}</p>
              </div>
              {project.hackatimeProjects && project.hackatimeProjects.length > 0 && (
                <div>
                  <p className="text-brown-800 text-xs uppercase mb-1">Firmware Time</p>
                  <p className="text-brown-800 text-xl">
                    {(project.hackatimeProjects.reduce((sum, p) => sum + p.totalSeconds, 0) / 3600).toFixed(1)}h
                  </p>
                </div>
              )}
              <div>
                <p className="text-brown-800 text-xs uppercase mb-1">Complexity Level</p>
                {project.tier ? (() => {
                  const tier = getTierById(project.tier);
                  return tier ? (
                    <div>
                      <p className="text-brown-800 text-xl">{tier.name}</p>
                      <p className="text-cream-600 text-xs">{tier.bits}&nbsp;bits · {tier.minHours}{tier.maxHours === Infinity ? '+' : `–${tier.maxHours}`}h</p>
                    </div>
                  ) : (
                    <p className="text-brown-800 text-xl">Tier {project.tier}</p>
                  );
                })() : (
                  <p className="text-cream-600 text-xl">—</p>
                )}
              </div>
              <div>
                <p className="text-brown-800 text-xs uppercase mb-1">Design Status</p>
                <p className={`text-xl uppercase ${
                  project.designStatus === 'approved' ? 'text-green-600' :
                  project.designStatus === 'rejected' ? 'text-red-600' :
                  project.designStatus === 'in_review' ? 'text-orange-500' :
                  project.designStatus === 'update_requested' ? 'text-blue-500' :
                  'text-brown-800'
                }`}>{project.designStatus.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-brown-800 text-xs uppercase mb-1">Build Status</p>
                <p className={`text-xl uppercase ${
                  project.buildStatus === 'approved' ? 'text-green-600' :
                  project.buildStatus === 'rejected' ? 'text-red-600' :
                  project.buildStatus === 'in_review' ? 'text-orange-500' :
                  project.buildStatus === 'update_requested' ? 'text-blue-500' :
                  'text-brown-800'
                }`}>{project.buildStatus.replace('_', ' ')}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-brown-800 text-xs uppercase mb-1">Created</p>
              <p className="text-brown-800 text-sm">
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
                <p className="text-brown-800 text-xs uppercase mb-1">Description</p>
                <p className="text-brown-800 text-sm whitespace-pre-wrap">{project.description}</p>
              </div>
            )}

            {project.githubRepo && (
              <div className="mt-4">
                <p className="text-brown-800 text-xs uppercase mb-1">GitHub Repository</p>
                <a 
                  href={project.githubRepo} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-orange-500 hover:text-orange-400 text-sm break-all"
                >
                  {project.githubRepo}
                </a>
              </div>
            )}


            {project.badges.length > 0 && (
              <div className="mt-4">
                <p className="text-brown-800 text-xs uppercase mb-2">Badges Claimed</p>
                <div className="flex flex-wrap gap-2">
                  {project.badges.map((badge) => (
                    <span 
                      key={badge.id}
                      className={`px-2 py-1 text-xs uppercase flex items-center gap-1.5 ${
                        badge.grantedAt 
                          ? 'bg-green-600/30 border border-green-600 text-green-600' 
                          : 'bg-cream-200 border border-cream-400 text-brown-800'
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
              <div className="mt-4 pt-4 border-t border-cream-400 space-y-3">
                {project.designReviewedAt && (
                  <div>
                    <p className="text-brown-800 text-xs uppercase mb-1">Design Reviewed</p>
                    <p className="text-brown-800 text-sm">
                      {new Date(project.designReviewedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                      {project.designReviewedBy && ` by ${project.designReviewedBy}`}
                    </p>
                    {project.designReviewComments && (
                      <p className="text-brown-800 text-sm mt-1">{project.designReviewComments}</p>
                    )}
                  </div>
                )}
                {project.buildReviewedAt && (
                  <div>
                    <p className="text-brown-800 text-xs uppercase mb-1">Build Reviewed</p>
                    <p className="text-brown-800 text-sm">
                      {new Date(project.buildReviewedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                      {project.buildReviewedBy && ` by ${project.buildReviewedBy}`}
                    </p>
                    {project.buildReviewComments && (
                      <p className="text-brown-800 text-sm mt-1">{project.buildReviewComments}</p>
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
              <p className="text-brown-800 text-sm whitespace-pre-wrap">{project.designSubmissionNotes}</p>
            </div>
          )}

          {/* Build Submission Notes */}
          {project.buildSubmissionNotes && (
            <div className="bg-blue-100 border-2 border-blue-500/50 p-4 mb-6">
              <p className="text-blue-700 text-xs uppercase mb-2">Build Submission Notes from User</p>
              <p className="text-brown-800 text-sm whitespace-pre-wrap">{project.buildSubmissionNotes}</p>
            </div>
          )}

          {/* Work Sessions */}
          <div className="mb-8">
            <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Work Sessions</h2>
            {project.workSessions.length === 0 ? (
              <div className="bg-cream-100 border-2 border-cream-400 p-6 text-center">
                <p className="text-brown-800">No work sessions recorded</p>
              </div>
            ) : (
            <div className="space-y-4">
              {project.workSessions.map((session) => {
                const review = sessionReviews[session.id];
                const isReviewing = reviewingSession === session.id;

                return (
                  <div 
                    key={session.id} 
                    className={`bg-cream-100 border-2 p-4 ${
                      review?.isReviewed ? 'border-green-600/50' : 'border-cream-400'
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
                        <span className="text-brown-800 text-sm">
                          {new Date(session.createdAt).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <span className="bg-cream-200 border border-cream-400 text-brown-800 px-2 py-0.5 text-sm">
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
                          <span key={i} className="bg-cream-200 text-brown-800 px-2 py-0.5 text-xs">
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}

                    {session.content ? (
                      <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-brown-800 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-400 [&_.wmde-markdown_img]:my-2 [&_.wmde-markdown_p]:my-1 mb-4" data-color-mode="light">
                        <MDPreview source={session.content} />
                      </div>
                    ) : (
                      <p className="text-brown-800 text-sm italic mb-4">No content recorded</p>
                    )}

                    {/* Session Review Form - only show if any stage is in review */}
                    {isAnyStageInReview ? (
                      <div className="bg-cream-200 border border-cream-400 p-3 mt-4">
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className="text-brown-800 text-xs uppercase block mb-1">
                              Hours Approved
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={session.hoursClaimed}
                              step="0.5"
                              value={review?.hoursApproved ?? session.hoursClaimed}
                              onChange={(e) => updateSessionReview(session.id, 'hoursApproved', parseFloat(e.target.value) || 0)}
                              className="w-full bg-cream-100 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                            />
                          </div>
                          <div className="flex items-end">
                            <span className="text-brown-800 text-sm pb-2">
                              of {session.hoursClaimed}h logged
                            </span>
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="text-brown-800 text-xs uppercase block mb-1">
                            Review Comments (optional)
                          </label>
                          <textarea
                            value={review?.reviewComments ?? ''}
                            onChange={(e) => updateSessionReview(session.id, 'reviewComments', e.target.value)}
                            rows={2}
                            className="w-full bg-cream-100 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
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
                      <div className="bg-cream-200 border border-cream-400 p-3 mt-4">
                        <div className="flex items-center justify-between">
                          <span className="text-brown-800 text-sm">Hours Approved: <span className="text-brown-800">{session.hoursApproved}h</span></span>
                          {session.reviewComments && (
                            <span className="text-brown-800 text-sm">{session.reviewComments}</span>
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
              <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Firmware Time (Hackatime)</h2>
              <div className="space-y-3">
                {project.hackatimeProjects.map((hp) => {
                  const totalHours = hp.totalSeconds / 3600;
                  const review = hackatimeReviews[hp.id];
                  const isReviewing = reviewingHackatime === hp.id;

                  return (
                    <div
                      key={hp.id}
                      className={`bg-cream-100 border-2 p-4 ${
                        review?.isReviewed ? 'border-green-600/50' : 'border-cream-400'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-brown-800 font-medium">{hp.hackatimeProject}</span>
                          <span className="bg-cream-200 border border-cream-400 text-brown-800 px-2 py-0.5 text-sm">
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
                        <div className="bg-cream-200 border border-cream-400 p-3 mt-2">
                          <div className="grid grid-cols-2 gap-4 mb-3">
                            <div>
                              <label className="text-brown-800 text-xs uppercase block mb-1">
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
                                className="w-full bg-cream-100 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                              />
                            </div>
                            <div className="flex items-end">
                              <span className="text-brown-800 text-sm pb-2">
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
                        <div className="bg-cream-200 border border-cream-400 p-3 mt-2">
                          <span className="text-brown-800 text-sm">
                            Hours Approved: <span className="text-brown-800">{hp.hoursApproved}h</span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="bg-cream-100 border-2 border-cream-400 p-3">
                  <span className="text-brown-800 text-sm">
                    Total firmware time:{' '}
                    <span className="text-brown-800 font-medium">
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
              <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Bill of Materials</h2>
              
              {/* Cost Summary */}
              {(() => {
                const totalCost = project.bomItems.reduce((sum, item) => sum + item.costPerItem * item.quantity, 0);
                const approvedCost = project.bomItems
                  .filter((item) => item.status === 'approved')
                  .reduce((sum, item) => sum + item.costPerItem * item.quantity, 0);
                const costPerHour = totalHoursClaimed > 0 ? totalCost / totalHoursClaimed : null;
                const tier = project.tier ? getTierById(project.tier) : null;
                const bomGrant = project.reviewActions.find(
                  (a) => a.stage === "DESIGN" && a.decision === "APPROVED"
                )?.grantAmount ?? 0;
                const netBits = tier ? Math.max(0, tier.bits - Math.round(bomGrant)) : null;
                const bitsPerHour = netBits !== null && totalHoursClaimed > 0 ? netBits / totalHoursClaimed : null;
                return (
                  <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-4">
                    <div className="flex gap-6 flex-wrap">
                      <div>
                        <p className="text-brown-800 text-xs uppercase mb-1">Total Estimated</p>
                        <p className="text-brown-800 text-lg">${formatPrice(totalCost)}</p>
                      </div>
                      <div>
                        <p className="text-brown-800 text-xs uppercase mb-1">Approved</p>
                        <p className="text-green-600 text-lg">${formatPrice(approvedCost)}</p>
                      </div>
                      <div>
                        <p className="text-brown-800 text-xs uppercase mb-1">Cost / Hour</p>
                        <p className="text-brown-800 text-lg">
                          {costPerHour !== null ? `$${formatPrice(costPerHour)}/h` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-brown-800 text-xs uppercase mb-1">Bits / Hour</p>
                        <p className="text-orange-500 text-lg">
                          {bitsPerHour !== null ? `${bitsPerHour.toFixed(1)}/h` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* BOM Table */}
              <div className="bg-cream-100 border-2 border-cream-400 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-400">
                      <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Name</th>
                      <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Purpose</th>
                      <th className="text-right text-brown-800 text-xs uppercase px-4 py-3">Cost</th>
                      <th className="text-right text-brown-800 text-xs uppercase px-4 py-3">Qty</th>
                      <th className="text-right text-brown-800 text-xs uppercase px-4 py-3">Total</th>
                      <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Link</th>
                      <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Distributor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.bomItems.map((item) => (
                      <tr key={item.id} className="border-b border-cream-400 last:border-b-0">
                        <td className="text-brown-800 px-4 py-3">{item.name}</td>
                        <td className="text-brown-800 px-4 py-3">{item.purpose}</td>
                        <td className="text-brown-800 text-right px-4 py-3">${formatPrice(item.costPerItem)}</td>
                        <td className="text-brown-800 text-right px-4 py-3">{item.quantity}</td>
                        <td className="text-brown-800 text-right px-4 py-3">${formatPrice(item.costPerItem * item.quantity)}</td>
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
                        <td className="text-brown-800 px-4 py-3">{item.distributor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cart Screenshots */}
              {project.cartScreenshots && project.cartScreenshots.length > 0 && (
                <div className="mt-4">
                  <p className="text-brown-800 text-xs uppercase mb-2">Cart Screenshots</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {project.cartScreenshots.map((url, i) => (
                      <button key={i} type="button" onClick={() => setExpandedScreenshot(url)} className="block cursor-pointer">
                        <img src={url} alt={`Cart screenshot ${i + 1}`} className="w-full h-40 object-cover border-2 border-cream-400 hover:border-orange-500 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Design Approval Section */}
          {isDesignInReview ? (
            <div className="bg-purple-50 border-2 border-yellow-500/50 p-6 mb-6">
              <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Design Approval</h2>
              
              {!allSessionsReviewed && (
                <p className="text-yellow-600 text-sm mb-4">
                  ⚠ Review all sessions before making a decision
                </p>
              )}

              <div className="mb-4">
                <label className="text-brown-800 text-xs uppercase block mb-2">
                  Complexity Level <span className="text-cream-600 normal-case">(sets bits awarded on build completion)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TIERS.map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setDesignTier(designTier === tier.id ? null : tier.id)}
                      className={`px-3 py-2 text-sm text-left cursor-pointer border ${
                        designTier === tier.id
                          ? 'bg-yellow-500 text-white border-yellow-500 led-flicker'
                          : 'bg-cream-100 text-brown-800 hover:bg-cream-200 border-cream-400'
                      }`}
                    >
                      <span className="uppercase font-medium">{tier.name}</span>
                      <span className="block text-xs mt-0.5 opacity-80">
                        {tier.bits}&nbsp;bits · {tier.minHours}{tier.maxHours === Infinity ? '+' : `–${tier.maxHours}`}h
                      </span>
                    </button>
                  ))}
                </div>
                {designTier === null && (
                  <p className="text-cream-600 text-xs mt-2">No complexity level selected — 0&nbsp;bits will be awarded on build completion.</p>
                )}
              </div>

              <div className="mb-4">
                <label className="text-brown-800 text-xs uppercase block mb-2">
                  Approved BOM Grant <span className="text-cream-600 normal-case">(bits, 1 bit = $1 — deducted from complexity level at build)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={designBomGrant}
                    onChange={(e) => setDesignBomGrant(e.target.value)}
                    className="w-32 bg-cream-100 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                    placeholder="0"
                  />
                  <span className="text-brown-800 text-sm">bits</span>
                  {designTier !== null && (() => {
                    const tier = getTierById(designTier);
                    const grant = parseInt(designBomGrant || '0', 10) || 0;
                    const net = tier ? Math.max(0, tier.bits - grant) : 0;
                    return tier ? (
                      <span className="text-cream-600 text-xs">
                        → {tier.bits} − {grant} = <strong className="text-brown-800">{net}&nbsp;bits net</strong>
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>

              <div className="mb-4">
                <label className="text-brown-800 text-xs uppercase block mb-2">
                  Design Review Comments (optional)
                </label>
                <textarea
                  value={designComments}
                  onChange={(e) => setDesignComments(e.target.value)}
                  rows={3}
                  className="w-full bg-cream-100 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
                  placeholder="Add feedback for the design stage..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleDesignDecision('rejected')}
                  disabled={submitting}
                  className="flex-1 bg-red-600/20 border-2 border-red-600 hover:bg-red-600/30 text-red-500 py-3 uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Reject Design'}
                </button>
                <button
                  onClick={() => handleDesignDecision('approved')}
                  disabled={submitting}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Approve Design'}
                </button>
              </div>
            </div>
          ) : (project.designStatus === 'approved' || project.designStatus === 'rejected') && (
            <div className={`border-2 p-6 mb-6 ${
              project.designStatus === 'approved' 
                ? 'bg-green-600/10 border-green-600/50' 
                : 'bg-red-600/10 border-red-600/50'
            }`}>
              <p className={`text-xl uppercase tracking-wide ${
                project.designStatus === 'approved' ? 'text-green-500' : 'text-red-500'
              }`}>
                Design {project.designStatus}
              </p>
            </div>
          )}

          {/* Build Approval Section - only show when design is approved */}
          {project.designStatus === 'approved' && (
            isBuildInReview ? (
              <div className="bg-cyan-50 border-2 border-cyan-500/50 p-6 mb-6">
                <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">Build Approval</h2>
                
                {!allSessionsReviewed && (
                  <p className="text-yellow-600 text-sm mb-4">
                    ⚠ Review all sessions before making a decision
                  </p>
                )}

                {/* Bits preview */}
                <div className="mb-4 bg-cream-200 border border-cream-400 p-3">
                  <p className="text-brown-800 text-xs uppercase mb-1">Bits to be awarded</p>
                  {project.tier ? (() => {
                    const tier = getTierById(project.tier!);
                    const designAction = project.reviewActions.find(
                      (a) => a.stage === "DESIGN" && a.decision === "APPROVED"
                    );
                    const bomDeduction = Math.round(designAction?.grantAmount ?? 0);
                    const netBits = tier ? Math.max(0, tier.bits - bomDeduction) : 0;
                    return tier ? (
                      <div>
                        <p className="text-brown-800 font-medium">{netBits}&nbsp;bits</p>
                        <p className="text-cream-600 text-xs mt-0.5">
                          {tier.bits} ({tier.name}) − {bomDeduction} BOM grant = {netBits}&nbsp;bits net
                        </p>
                      </div>
                    ) : (
                      <p className="text-cream-600">Unknown complexity level</p>
                    );
                  })() : (
                    <p className="text-cream-600">— (no complexity level set; 0&nbsp;bits will be awarded)</p>
                  )}
                </div>

                <div className="mb-4">
                  <label className="text-brown-800 text-xs uppercase block mb-2">
                    Additional bits grant (optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={buildGrantAmount}
                      onChange={(e) => setBuildGrantAmount(e.target.value)}
                      className="w-32 bg-cream-100 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      placeholder="0"
                    />
                    <span className="text-brown-800 text-sm">bits</span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-brown-800 text-xs uppercase block mb-2">
                    Build Review Comments (optional)
                  </label>
                  <textarea
                    value={buildComments}
                    onChange={(e) => setBuildComments(e.target.value)}
                    rows={3}
                    className="w-full bg-cream-100 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
                    placeholder="Add feedback for the build stage..."
                  />
                </div>

                <div className="mb-4">
                  <label className="text-brown-800 text-xs uppercase block mb-2">
                    Override Hours Justification (optional, sent to Airtable)
                  </label>
                  <textarea
                    value={buildHoursJustification}
                    onChange={(e) => setBuildHoursJustification(e.target.value)}
                    rows={2}
                    className="w-full bg-cream-100 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
                    placeholder="Explain why the hours are being overridden..."
                  />
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
