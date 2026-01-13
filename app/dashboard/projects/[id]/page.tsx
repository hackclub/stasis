'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
import Link from 'next/link';
import { ProjectTag } from "@/app/generated/prisma/enums";

type BadgeType = 
  | "I2C" | "SPI" | "WIFI" | "BLUETOOTH" | "OTHER_RF"
  | "ANALOG_SENSORS" | "DIGITAL_SENSORS" | "CAD" | "DISPLAYS" | "MOTORS"
  | "CAMERAS" | "METAL_MACHINING" | "WOOD_FASTENERS" | "MACHINE_LEARNING"
  | "MCU_INTEGRATION" | "FOUR_LAYER_PCB" | "SOLDERING";

interface WorkSession {
  id: string;
  hoursClaimed: number;
  hoursApproved: number | null;
  content: string | null;
  createdAt: string;
}

interface ProjectBadge {
  id: string;
  badge: BadgeType;
  claimedAt: string;
  grantedAt: string | null;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  tags: ProjectTag[];
  totalHoursClaimed: number;
  totalHoursApproved: number;
  isStarter: boolean;
  githubRepo: string | null;
  submittedAt: string | null;
  createdAt: string;
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

const MIN_HOURS_REQUIRED = 4;

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
        } else if (res.status === 404) {
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchProject();
    } else if (!isPending) {
      router.push('/dashboard');
    }
  }, [session, isPending, projectId, router]);

  const handleSubmitForReview = async () => {
    if (!project) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/submit`, {
        method: 'POST',
      });
      
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to submit for review');
      }
    } catch (error) {
      console.error('Failed to submit for review:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-500">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const badges = project.badges ?? [];
  const approvedBadges = badges.filter(b => b.grantedAt !== null);
  const pendingBadges = badges.filter(b => b.grantedAt === null);
  const canSubmit = project.githubRepo && badges.length >= 1 && project.totalHoursClaimed >= MIN_HOURS_REQUIRED;

  return (
    <>
      <div className="min-h-screen bg-cream-950 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href="/dashboard" className="text-cream-500 hover:text-brand-500 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Project Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h1 className="text-brand-500 text-3xl uppercase tracking-wide mb-2">{project.title}</h1>
                {project.description && (
                  <p className="text-cream-400 text-lg">{project.description}</p>
                )}
              </div>
              
              {/* Placeholder Image */}
              <div className="w-48 h-32 bg-cream-900 border-2 border-cream-700 flex items-center justify-center flex-shrink-0">
                <span className="text-cream-600 text-xs uppercase">Project Image</span>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mt-4">
              {project.tags.map((tag) => (
                <span 
                  key={tag} 
                  className="text-xs bg-cream-850 text-cream-500 px-2 py-1 uppercase"
                >
                  {TAG_LABELS[tag]}
                </span>
              ))}
              {project.isStarter && (
                <span className="text-xs bg-brand-500 text-brand-900 px-2 py-1 uppercase">
                  Starter
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-6 mt-4 text-sm">
              <div>
                <span className="text-cream-600">Hours Claimed:</span>{' '}
                <span className="text-cream-100">{project.totalHoursClaimed.toFixed(1)}h</span>
              </div>
              <div>
                <span className="text-cream-600">Hours Approved:</span>{' '}
                <span className="text-brand-500">{project.totalHoursApproved.toFixed(1)}h</span>
              </div>
              {project.githubRepo && (
                <div>
                  <a 
                    href={project.githubRepo} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-cream-500 hover:text-brand-500 transition-colors"
                  >
                    GitHub →
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Badges Section */}
          <div className="bg-cream-900 border-2 border-cream-700 p-6 mb-6">
            <h2 className="text-cream-100 text-xl uppercase tracking-wide mb-4">Badges</h2>
            
            {badges.length === 0 ? (
              <p className="text-cream-600 text-sm">No badges claimed yet</p>
            ) : (
              <div className="space-y-4">
                {approvedBadges.length > 0 && (
                  <div>
                    <p className="text-cream-600 text-xs uppercase mb-2">Approved</p>
                    <div className="flex flex-wrap gap-2">
                      {approvedBadges.map((badge) => (
                        <span 
                          key={badge.id}
                          className="bg-green-600/30 border border-green-600 text-green-500 px-3 py-1.5 text-sm uppercase"
                        >
                          {BADGE_LABELS[badge.badge]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {pendingBadges.length > 0 && (
                  <div>
                    <p className="text-cream-600 text-xs uppercase mb-2">Pending</p>
                    <div className="flex flex-wrap gap-2">
                      {pendingBadges.map((badge) => (
                        <span 
                          key={badge.id}
                          className="bg-cream-850 border border-cream-700 text-cream-400 px-3 py-1.5 text-sm uppercase"
                        >
                          {BADGE_LABELS[badge.badge]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submission Status */}
          {project.submittedAt ? (
            <div className="bg-green-600/20 border-2 border-green-600 p-4 mb-6">
              <p className="text-green-500 text-lg uppercase flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Submitted for Review
              </p>
              <p className="text-green-500/70 text-sm mt-1">
                {new Date(project.submittedAt).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="bg-cream-900 border-2 border-cream-700 p-4 mb-6">
              <p className="text-cream-600 text-xs uppercase mb-3">Submission Requirements</p>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${project.githubRepo ? 'text-green-500' : 'text-cream-500'}`}>
                  {project.githubRepo ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-600 inline-block" />
                  )}
                  GitHub repository linked
                </div>
                <div className={`flex items-center gap-2 text-sm ${badges.length >= 1 ? 'text-green-500' : 'text-cream-500'}`}>
                  {badges.length >= 1 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-600 inline-block" />
                  )}
                  At least 1 badge claimed
                </div>
                <div className={`flex items-center gap-2 text-sm ${project.totalHoursClaimed >= MIN_HOURS_REQUIRED ? 'text-green-500' : 'text-cream-500'}`}>
                  {project.totalHoursClaimed >= MIN_HOURS_REQUIRED ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-600 inline-block" />
                  )}
                  Minimum {MIN_HOURS_REQUIRED} hours logged ({project.totalHoursClaimed.toFixed(1)}h)
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 mb-8">
            <Link
              href={`/dashboard/projects/${project.id}/session/new`}
              className="flex-1 bg-brand-500 hover:bg-brand-400 text-brand-900 py-3 text-center uppercase tracking-wider transition-colors"
            >
              + Log Session
            </Link>
            <Link
              href={`/dashboard/projects/${project.id}/edit`}
              className="flex-1 bg-cream-850 hover:bg-cream-800 text-cream-100 py-3 text-center uppercase tracking-wider transition-colors"
            >
              Edit Project
            </Link>
            {!project.submittedAt && (
              <button
                onClick={handleSubmitForReview}
                disabled={submitting || !canSubmit}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-cream-700 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-3 uppercase tracking-wider transition-colors cursor-pointer"
              >
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </button>
            )}
          </div>

          {/* Session Devlogs */}
          <div className="bg-cream-900 border-2 border-cream-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-cream-100 text-xl uppercase tracking-wide">Session Devlogs</h2>
              <span className="text-cream-600 text-sm">{project.workSessions.length} sessions</span>
            </div>
            
            {project.workSessions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-cream-600">No sessions logged yet</p>
                <Link
                  href={`/dashboard/projects/${project.id}/session/new`}
                  className="inline-block mt-4 text-brand-500 hover:text-brand-400 transition-colors"
                >
                  Log your first session →
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {project.workSessions.map((ws) => (
                  <div key={ws.id} className="bg-cream-950 border border-cream-800 p-4 group">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-cream-600 text-sm">
                          {new Date(ws.createdAt).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="bg-cream-850 text-cream-300 px-2 py-0.5 text-sm">
                            {ws.hoursClaimed}h claimed
                          </span>
                          {ws.hoursApproved !== null && (
                            <span className="bg-green-600/30 text-green-500 px-2 py-0.5 text-sm">
                              {ws.hoursApproved}h approved
                            </span>
                          )}
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/projects/${project.id}/session/${ws.id}/edit`}
                        className="opacity-0 group-hover:opacity-100 text-cream-500 hover:text-brand-500 transition-all text-sm"
                      >
                        Edit
                      </Link>
                    </div>
                    
                    {ws.content ? (
                      <div className="text-cream-300 text-sm whitespace-pre-wrap leading-relaxed">
                        {ws.content}
                      </div>
                    ) : (
                      <p className="text-cream-600 text-sm italic">No content recorded</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <NoiseOverlay />
    </>
  );
}
