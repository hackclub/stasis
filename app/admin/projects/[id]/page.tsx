'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
import { StageProgress } from '@/app/components/projects/StageProgress';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const MDPreview = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default.Markdown),
  { ssr: false }
);
import { ProjectTag } from "@/app/generated/prisma/enums";
import { STARTER_PROJECT_NAMES } from "@/lib/starter-projects";

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
  createdAt: string;
  submittedAt: string | null;
  user: ProjectUser;
  workSessions: WorkSession[];
  badges: ProjectBadge[];
  bomItems: BOMItem[];
}

const TAG_LABELS: Record<ProjectTag, string> = {
  PCB: "PCB",
  ROBOT: "Robot",
  CAD: "CAD",
  ARDUINO: "Arduino",
  RASPBERRY_PI: "Raspberry Pi",
};

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
  const [sessionReviews, setSessionReviews] = useState<Record<string, SessionReviewState>>({});
  const [designComments, setDesignComments] = useState('');
  const [buildComments, setBuildComments] = useState('');
  const [designGrantAmount, setDesignGrantAmount] = useState('');
  const [buildGrantAmount, setBuildGrantAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviewingSession, setReviewingSession] = useState<string | null>(null);

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
  }, [projectId, router]);

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
      const grantAmountStr = stage === 'design' ? designGrantAmount : buildGrantAmount;
      const grantAmount = grantAmountStr ? parseFloat(grantAmountStr) : null;
      
      const res = await fetch(`/api/admin/projects/${projectId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          decision,
          reviewComments: reviewComments || null,
          grantAmount: decision === 'approved' ? grantAmount : null,
        }),
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        if (stage === 'design') {
          setDesignComments('');
          setDesignGrantAmount('');
        }
        if (stage === 'build') {
          setBuildComments('');
          setBuildGrantAmount('');
        }
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-300">Loading...</p>
      </div>
    );
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
      <div className="min-h-screen bg-cream-950 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href="/admin" className="text-cream-300 hover:text-brand-500 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Admin
          </Link>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Stage Progress */}
          <div className="mb-6 bg-cream-900 border-2 border-cream-700 p-6">
            <StageProgress
              designStatus={project.designStatus as 'draft' | 'in_review' | 'approved' | 'rejected' | 'update_requested'}
              buildStatus={project.buildStatus as 'draft' | 'in_review' | 'approved' | 'rejected' | 'update_requested'}
              showMessages={false}
            />
          </div>

          {/* Project Header */}
          <div className="mb-6">
            <h1 className="text-brand-500 text-3xl uppercase tracking-wide mb-2">{project.title}</h1>
            <p className="text-cream-200 text-sm">
              by {project.user.name || project.user.email}
              {project.user.name && <span className="text-cream-600"> ({project.user.email})</span>}
            </p>
          </div>

          {/* Cover Image */}
          {project.coverImage && (
            <div className="mb-6">
              <a href={project.coverImage} target="_blank" rel="noopener noreferrer">
                <img 
                  src={project.coverImage} 
                  alt={project.title}
                  className="w-full max-h-96 object-cover border-2 border-cream-700 hover:border-brand-500 transition-colors"
                />
              </a>
            </div>
          )}

          {/* Project Details */}
          <div className="bg-cream-900 border-2 border-cream-700 p-4 mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-cream-300 text-xs uppercase mb-1">Total Hours Claimed</p>
                <p className="text-cream-100 text-xl">{totalHoursClaimed.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-cream-300 text-xs uppercase mb-1">Sessions</p>
                <p className="text-cream-100 text-xl">{project.workSessions.length}</p>
              </div>
              <div>
                <p className="text-cream-300 text-xs uppercase mb-1">Design Status</p>
                <p className={`text-xl uppercase ${
                  project.designStatus === 'approved' ? 'text-green-500' :
                  project.designStatus === 'rejected' ? 'text-red-500' :
                  project.designStatus === 'in_review' ? 'text-brand-500' :
                  project.designStatus === 'update_requested' ? 'text-blue-400' :
                  'text-cream-300'
                }`}>{project.designStatus.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-cream-300 text-xs uppercase mb-1">Build Status</p>
                <p className={`text-xl uppercase ${
                  project.buildStatus === 'approved' ? 'text-green-500' :
                  project.buildStatus === 'rejected' ? 'text-red-500' :
                  project.buildStatus === 'in_review' ? 'text-brand-500' :
                  project.buildStatus === 'update_requested' ? 'text-blue-400' :
                  'text-cream-300'
                }`}>{project.buildStatus.replace('_', ' ')}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-cream-300 text-xs uppercase mb-1">Created</p>
              <p className="text-cream-100 text-sm">
                {new Date(project.createdAt).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric'
                })}
              </p>
            </div>

            {project.isStarter && (
              <div className="mt-4">
                <span className="bg-brand-500/20 border border-brand-500/50 text-brand-400 px-2 py-1 text-xs uppercase">
                  {project.starterProjectId ? `Starter: ${STARTER_PROJECT_NAMES[project.starterProjectId] ?? project.starterProjectId}` : 'Starter Project'}
                </span>
              </div>
            )}

            {project.description && (
              <div className="mt-4">
                <p className="text-cream-300 text-xs uppercase mb-1">Description</p>
                <p className="text-cream-300 text-sm whitespace-pre-wrap">{project.description}</p>
              </div>
            )}

            {project.githubRepo && (
              <div className="mt-4">
                <p className="text-cream-300 text-xs uppercase mb-1">GitHub Repository</p>
                <a 
                  href={project.githubRepo} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-brand-400 hover:text-brand-300 text-sm break-all"
                >
                  {project.githubRepo}
                </a>
              </div>
            )}

            {project.tags.length > 0 && (
              <div className="mt-4">
                <p className="text-cream-300 text-xs uppercase mb-2">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <span 
                      key={tag}
                      className="bg-cream-800 border border-cream-600 text-cream-200 px-2 py-1 text-xs uppercase"
                    >
                      {TAG_LABELS[tag]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {project.badges.length > 0 && (
              <div className="mt-4">
                <p className="text-cream-300 text-xs uppercase mb-2">Badges Claimed</p>
                <div className="flex flex-wrap gap-2">
                  {project.badges.map((badge) => (
                    <span 
                      key={badge.id}
                      className={`px-2 py-1 text-xs uppercase ${
                        badge.grantedAt 
                          ? 'bg-green-600/30 border border-green-600 text-green-400' 
                          : 'bg-cream-800 border border-cream-500 text-cream-100'
                      }`}
                    >
                      {BADGE_LABELS[badge.badge]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(project.designReviewedAt || project.buildReviewedAt) && (
              <div className="mt-4 pt-4 border-t border-cream-700 space-y-3">
                {project.designReviewedAt && (
                  <div>
                    <p className="text-cream-300 text-xs uppercase mb-1">Design Reviewed</p>
                    <p className="text-cream-300 text-sm">
                      {new Date(project.designReviewedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                      {project.designReviewedBy && ` by ${project.designReviewedBy}`}
                    </p>
                    {project.designReviewComments && (
                      <p className="text-cream-200 text-sm mt-1">{project.designReviewComments}</p>
                    )}
                  </div>
                )}
                {project.buildReviewedAt && (
                  <div>
                    <p className="text-cream-300 text-xs uppercase mb-1">Build Reviewed</p>
                    <p className="text-cream-300 text-sm">
                      {new Date(project.buildReviewedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                      {project.buildReviewedBy && ` by ${project.buildReviewedBy}`}
                    </p>
                    {project.buildReviewComments && (
                      <p className="text-cream-200 text-sm mt-1">{project.buildReviewComments}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Design Submission Notes */}
          {project.designSubmissionNotes && (
            <div className="bg-yellow-600/10 border-2 border-yellow-600/50 p-4 mb-6">
              <p className="text-yellow-500 text-xs uppercase mb-2">Design Submission Notes from User</p>
              <p className="text-cream-200 text-sm whitespace-pre-wrap">{project.designSubmissionNotes}</p>
            </div>
          )}

          {/* Build Submission Notes */}
          {project.buildSubmissionNotes && (
            <div className="bg-blue-600/10 border-2 border-blue-600/50 p-4 mb-6">
              <p className="text-blue-500 text-xs uppercase mb-2">Build Submission Notes from User</p>
              <p className="text-cream-200 text-sm whitespace-pre-wrap">{project.buildSubmissionNotes}</p>
            </div>
          )}

          {/* Work Sessions */}
          <div className="mb-8">
            <h2 className="text-cream-100 text-xl uppercase tracking-wide mb-4">Work Sessions</h2>
            {project.workSessions.length === 0 ? (
              <div className="bg-cream-900 border-2 border-cream-700 p-6 text-center">
                <p className="text-cream-300">No work sessions recorded</p>
              </div>
            ) : (
            <div className="space-y-4">
              {project.workSessions.map((session) => {
                const review = sessionReviews[session.id];
                const isReviewing = reviewingSession === session.id;

                return (
                  <div 
                    key={session.id} 
                    className={`bg-cream-900 border-2 p-4 ${
                      review?.isReviewed ? 'border-green-600/50' : 'border-cream-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs uppercase font-bold ${
                          session.stage === 'DESIGN' 
                            ? 'bg-purple-600/30 border border-purple-600 text-purple-400' 
                            : 'bg-cyan-600/30 border border-cyan-600 text-cyan-400'
                        }`}>
                          {session.stage}
                        </span>
                        <span className="text-cream-300 text-sm">
                          {new Date(session.createdAt).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <span className="bg-cream-800 border border-cream-600 text-cream-200 px-2 py-0.5 text-sm">
                          {session.hoursClaimed}h claimed
                        </span>
                        {review?.isReviewed && (
                          <span className="bg-green-600/30 border border-green-600 text-green-400 px-2 py-0.5 text-sm">
                            ✓ Reviewed
                          </span>
                        )}
                      </div>
                    </div>

                    {session.categories && session.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {session.categories.map((cat, i) => (
                          <span key={i} className="bg-cream-950 text-cream-200 px-2 py-0.5 text-xs">
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}

                    {session.content ? (
                      <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-cream-200 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-600 [&_.wmde-markdown_img]:my-2 [&_.wmde-markdown_p]:my-1 mb-4" data-color-mode="dark">
                        <MDPreview source={session.content} />
                      </div>
                    ) : (
                      <p className="text-cream-300 text-sm italic mb-4">No content recorded</p>
                    )}

                    {session.media.length > 0 && (
                      <div className="flex flex-col gap-3 mb-4">
                        {session.media.filter(m => m.type === "IMAGE").map((m) => (
                          <a 
                            key={m.id} 
                            href={m.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block max-w-full"
                          >
                            <img 
                              src={m.url} 
                              alt="Session media"
                              className="max-w-full max-h-64 border border-cream-600 hover:border-brand-500 transition-colors"
                            />
                          </a>
                        ))}
                        {session.media.filter(m => m.type === "VIDEO").map((m) => (
                          <video 
                            key={m.id} 
                            src={m.url}
                            controls
                            className="max-w-full max-h-64 border border-cream-600"
                          />
                        ))}
                      </div>
                    )}

                    {/* Session Review Form - only show if any stage is in review */}
                    {isAnyStageInReview ? (
                      <div className="bg-cream-950 border border-cream-700 p-3 mt-4">
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className="text-cream-300 text-xs uppercase block mb-1">
                              Hours Approved
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={session.hoursClaimed}
                              step="0.5"
                              value={review?.hoursApproved ?? session.hoursClaimed}
                              onChange={(e) => updateSessionReview(session.id, 'hoursApproved', parseFloat(e.target.value) || 0)}
                              className="w-full bg-cream-900 border border-cream-600 text-cream-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                            />
                          </div>
                          <div className="flex items-end">
                            <span className="text-cream-300 text-sm pb-2">
                              of {session.hoursClaimed}h claimed
                            </span>
                          </div>
                        </div>
                        <div className="mb-3">
                          <label className="text-cream-300 text-xs uppercase block mb-1">
                            Review Comments (optional)
                          </label>
                          <textarea
                            value={review?.reviewComments ?? ''}
                            onChange={(e) => updateSessionReview(session.id, 'reviewComments', e.target.value)}
                            rows={2}
                            className="w-full bg-cream-900 border border-cream-600 text-cream-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none resize-none"
                            placeholder="Add feedback for this session..."
                          />
                        </div>
                        <button
                          onClick={() => handleSessionReview(session.id)}
                          disabled={isReviewing}
                          className={`w-full py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer ${
                            review?.isReviewed 
                              ? 'bg-green-600/20 border border-green-600 text-green-400 hover:bg-green-600/30' 
                              : 'bg-brand-500 hover:bg-brand-400 text-white'
                          }`}
                        >
                          {isReviewing ? 'Saving...' : review?.isReviewed ? 'Update Review' : 'Review Session'}
                        </button>
                      </div>
                    ) : session.hoursApproved !== null && (
                      <div className="bg-cream-950 border border-cream-700 p-3 mt-4">
                        <div className="flex items-center justify-between">
                          <span className="text-cream-300 text-sm">Hours Approved: <span className="text-cream-100">{session.hoursApproved}h</span></span>
                          {session.reviewComments && (
                            <span className="text-cream-200 text-sm">{session.reviewComments}</span>
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

          {/* Bill of Materials */}
          {project.bomItems && project.bomItems.length > 0 && (
            <div className="mb-8">
              <h2 className="text-cream-100 text-xl uppercase tracking-wide mb-4">Bill of Materials</h2>
              
              {/* Cost Summary */}
              {(() => {
                const totalCost = project.bomItems.reduce((sum, item) => sum + item.costPerItem * item.quantity, 0);
                const approvedCost = project.bomItems
                  .filter((item) => item.status === 'approved')
                  .reduce((sum, item) => sum + item.costPerItem * item.quantity, 0);
                return (
                  <div className="bg-cream-900 border-2 border-cream-700 p-4 mb-4">
                    <div className="flex gap-6">
                      <div>
                        <p className="text-cream-300 text-xs uppercase mb-1">Total Estimated</p>
                        <p className="text-cream-100 text-lg">${totalCost.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-cream-300 text-xs uppercase mb-1">Approved</p>
                        <p className="text-green-400 text-lg">${approvedCost.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* BOM Table */}
              <div className="bg-cream-900 border-2 border-cream-700 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-700">
                      <th className="text-left text-cream-300 text-xs uppercase px-4 py-3">Name</th>
                      <th className="text-left text-cream-300 text-xs uppercase px-4 py-3">Purpose</th>
                      <th className="text-right text-cream-300 text-xs uppercase px-4 py-3">Cost</th>
                      <th className="text-right text-cream-300 text-xs uppercase px-4 py-3">Qty</th>
                      <th className="text-right text-cream-300 text-xs uppercase px-4 py-3">Total</th>
                      <th className="text-left text-cream-300 text-xs uppercase px-4 py-3">Link</th>
                      <th className="text-left text-cream-300 text-xs uppercase px-4 py-3">Distributor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.bomItems.map((item) => (
                      <tr key={item.id} className="border-b border-cream-800 last:border-b-0">
                        <td className="text-cream-100 px-4 py-3">{item.name}</td>
                        <td className="text-cream-300 px-4 py-3">{item.purpose}</td>
                        <td className="text-cream-100 text-right px-4 py-3">${item.costPerItem.toFixed(2)}</td>
                        <td className="text-cream-100 text-right px-4 py-3">{item.quantity}</td>
                        <td className="text-cream-100 text-right px-4 py-3">${(item.costPerItem * item.quantity).toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-500 hover:text-brand-400 underline"
                          >
                            View
                          </a>
                        </td>
                        <td className="text-cream-300 px-4 py-3">{item.distributor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>


            </div>
          )}

          {/* Design Approval Section */}
          {isDesignInReview ? (
            <div className="bg-cream-900 border-2 border-purple-600/50 p-6 mb-6">
              <h2 className="text-cream-100 text-xl uppercase tracking-wide mb-4">Design Approval</h2>
              
              {!allSessionsReviewed && (
                <p className="text-yellow-500 text-sm mb-4">
                  ⚠ Review all sessions before making a decision
                </p>
              )}

              <div className="mb-4">
                <label className="text-cream-300 text-xs uppercase block mb-2">
                  Grant Amount (optional)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-cream-200">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={designGrantAmount}
                    onChange={(e) => setDesignGrantAmount(e.target.value)}
                    className="w-32 bg-cream-950 border border-cream-600 text-cream-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="text-cream-300 text-xs uppercase block mb-2">
                  Design Review Comments (optional)
                </label>
                <textarea
                  value={designComments}
                  onChange={(e) => setDesignComments(e.target.value)}
                  rows={3}
                  className="w-full bg-cream-950 border border-cream-600 text-cream-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none resize-none"
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
              <div className="bg-cream-900 border-2 border-cyan-600/50 p-6 mb-6">
                <h2 className="text-cream-100 text-xl uppercase tracking-wide mb-4">Build Approval</h2>
                
                {!allSessionsReviewed && (
                  <p className="text-yellow-500 text-sm mb-4">
                    ⚠ Review all sessions before making a decision
                  </p>
                )}

                <div className="mb-4">
                  <label className="text-cream-300 text-xs uppercase block mb-2">
                    Grant Amount (optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-cream-200">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={buildGrantAmount}
                      onChange={(e) => setBuildGrantAmount(e.target.value)}
                      className="w-32 bg-cream-950 border border-cream-600 text-cream-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-cream-300 text-xs uppercase block mb-2">
                    Build Review Comments (optional)
                  </label>
                  <textarea
                    value={buildComments}
                    onChange={(e) => setBuildComments(e.target.value)}
                    rows={3}
                    className="w-full bg-cream-950 border border-cream-600 text-cream-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none resize-none"
                    placeholder="Add feedback for the build stage..."
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
      </div>
      <NoiseOverlay />
    </>
  );
}
