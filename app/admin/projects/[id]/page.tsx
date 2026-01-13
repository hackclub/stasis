'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
import Link from 'next/link';
import { ProjectTag } from "@/app/generated/prisma/enums";

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
  tags: ProjectTag[];
  status: string;
  submittedAt: string | null;
  submissionNotes: string | null;
  user: ProjectUser;
  workSessions: WorkSession[];
  badges: ProjectBadge[];
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
  const [finalComments, setFinalComments] = useState('');
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

  const handleFinalDecision = async (decision: 'approved' | 'rejected') => {
    if (!project) return;

    const confirmMessage = decision === 'approved' 
      ? 'Are you sure you want to approve this project?' 
      : 'Are you sure you want to reject this project?';
    
    if (!confirm(confirmMessage)) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reviewComments: finalComments || null,
        }),
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

  const updateSessionReview = (sessionId: string, field: keyof SessionReviewState, value: number | string) => {
    setSessionReviews((prev) => ({
      ...prev,
      [sessionId]: { ...prev[sessionId], [field]: value },
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-500">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const totalHoursClaimed = project.workSessions.reduce((acc, s) => acc + s.hoursClaimed, 0);
  const allSessionsReviewed = Object.values(sessionReviews).every((r) => r.isReviewed);

  return (
    <>
      <div className="min-h-screen bg-cream-950 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href="/admin" className="text-cream-500 hover:text-brand-500 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Admin
          </Link>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Project Header */}
          <div className="mb-6">
            <h1 className="text-brand-500 text-3xl uppercase tracking-wide mb-2">{project.title}</h1>
            <p className="text-cream-400 text-sm">
              by {project.user.name || project.user.email}
              {project.user.name && <span className="text-cream-600"> ({project.user.email})</span>}
            </p>
          </div>

          {/* Project Details */}
          <div className="bg-cream-900 border-2 border-cream-700 p-4 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-cream-500 text-xs uppercase mb-1">Total Hours Claimed</p>
                <p className="text-cream-100 text-xl">{totalHoursClaimed.toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-cream-500 text-xs uppercase mb-1">Sessions</p>
                <p className="text-cream-100 text-xl">{project.workSessions.length}</p>
              </div>
            </div>

            {project.description && (
              <div className="mt-4">
                <p className="text-cream-500 text-xs uppercase mb-1">Description</p>
                <p className="text-cream-300 text-sm">{project.description}</p>
              </div>
            )}

            {project.githubRepo && (
              <div className="mt-4">
                <p className="text-cream-500 text-xs uppercase mb-1">GitHub Repository</p>
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
                <p className="text-cream-500 text-xs uppercase mb-2">Tags</p>
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
                <p className="text-cream-500 text-xs uppercase mb-2">Badges Claimed</p>
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
          </div>

          {/* Submission Notes */}
          {project.submissionNotes && (
            <div className="bg-yellow-600/10 border-2 border-yellow-600/50 p-4 mb-6">
              <p className="text-yellow-500 text-xs uppercase mb-2">Submission Notes from User</p>
              <p className="text-cream-200 text-sm whitespace-pre-wrap">{project.submissionNotes}</p>
            </div>
          )}

          {/* Work Sessions */}
          <div className="mb-8">
            <h2 className="text-cream-100 text-xl uppercase tracking-wide mb-4">Work Sessions</h2>
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
                      <div className="flex items-center gap-3">
                        <span className="text-cream-500 text-sm">
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
                          <span key={i} className="bg-cream-950 text-cream-400 px-2 py-0.5 text-xs">
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}

                    {session.content ? (
                      <div className="text-cream-200 text-sm whitespace-pre-wrap leading-relaxed mb-4">
                        {session.content}
                      </div>
                    ) : (
                      <p className="text-cream-500 text-sm italic mb-4">No content recorded</p>
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

                    {/* Session Review Form */}
                    <div className="bg-cream-950 border border-cream-700 p-3 mt-4">
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <label className="text-cream-500 text-xs uppercase block mb-1">
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
                          <span className="text-cream-500 text-sm pb-2">
                            of {session.hoursClaimed}h claimed
                          </span>
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="text-cream-500 text-xs uppercase block mb-1">
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
                  </div>
                );
              })}
            </div>
          </div>

          {/* Final Decision */}
          <div className="bg-cream-900 border-2 border-cream-700 p-6">
            <h2 className="text-cream-100 text-xl uppercase tracking-wide mb-4">Final Decision</h2>
            
            {!allSessionsReviewed && (
              <p className="text-yellow-500 text-sm mb-4">
                ⚠ Review all sessions before making a final decision
              </p>
            )}

            <div className="mb-4">
              <label className="text-cream-500 text-xs uppercase block mb-2">
                Overall Review Comments (optional)
              </label>
              <textarea
                value={finalComments}
                onChange={(e) => setFinalComments(e.target.value)}
                rows={3}
                className="w-full bg-cream-950 border border-cream-600 text-cream-100 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none resize-none"
                placeholder="Add overall feedback for the project..."
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleFinalDecision('rejected')}
                disabled={submitting}
                className="flex-1 bg-red-600/20 border-2 border-red-600 hover:bg-red-600/30 text-red-500 py-3 uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Reject Project'}
              </button>
              <button
                onClick={() => handleFinalDecision('approved')}
                disabled={submitting}
                className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Approve Project'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <NoiseOverlay />
    </>
  );
}
