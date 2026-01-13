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

interface SessionMedia {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
}

interface WorkSession {
  id: string;
  hoursClaimed: number;
  hoursApproved: number | null;
  content: string | null;
  createdAt: string;
  media: SessionMedia[];
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

  coverImage: string | null;
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
  const [uploading, setUploading] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

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
    setShowSubmitDialog(false);
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

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !project) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        alert(data.error || 'Failed to upload image');
        return;
      }

      const { url } = await uploadRes.json();

      const updateRes = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverImage: url }),
      });

      if (updateRes.ok) {
        setProject({ ...project, coverImage: url });
      }
    } catch (error) {
      console.error('Failed to upload screenshot:', error);
      alert('Failed to upload screenshot');
    } finally {
      setUploading(false);
      e.target.value = '';
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
  const canSubmit = badges.length >= 1 && project.totalHoursClaimed >= MIN_HOURS_REQUIRED;

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
              
              {/* Project Image / Upload */}
              <label className="w-48 h-32 bg-cream-900 border-2 border-dashed border-cream-600 hover:border-brand-500 hover:bg-cream-800 flex flex-col items-center justify-center flex-shrink-0 transition-colors cursor-pointer group relative overflow-hidden">
                {project.coverImage ? (
                  <>
                    <img 
                      src={project.coverImage} 
                      alt={project.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white mb-1">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                      <span className="text-white text-xs uppercase font-medium">Change Image</span>
                    </div>
                  </>
                ) : uploading ? (
                  <span className="text-cream-500 text-xs uppercase">Uploading...</span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cream-500 group-hover:text-brand-500 mb-1">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span className="text-cream-500 group-hover:text-brand-500 text-xs uppercase font-medium">Upload Screenshot</span>
                  </>
                )}
                <input 
                  type="file" 
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleScreenshotUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mt-4">
              {project.tags.map((tag) => (
                <span 
                  key={tag} 
                  className="text-xs bg-cream-800 text-cream-300 px-2 py-1 uppercase"
                >
                  {TAG_LABELS[tag]}
                </span>
              ))}
              {project.isStarter && (
                <span className="text-xs bg-brand-500 text-white font-medium px-2 py-1 uppercase">
                  Starter
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-6 mt-4 text-sm">
              <div>
                <span className="text-cream-500">Hours Claimed:</span>{' '}
                <span className="text-cream-200">{project.totalHoursClaimed.toFixed(1)}h</span>
              </div>
              <div>
                <span className="text-cream-500">Hours Approved:</span>{' '}
                <span className="text-brand-400">{project.totalHoursApproved.toFixed(1)}h</span>
              </div>

            </div>
          </div>

          {/* Badges Section */}
          <div className="bg-cream-900 border-2 border-cream-700 p-6 mb-6">
            <h2 className="text-cream-50 text-xl uppercase tracking-wide mb-4">Badges</h2>
            
            {badges.length === 0 ? (
              <p className="text-cream-500 text-sm">No badges claimed yet</p>
            ) : (
              <div className="space-y-4">
                {approvedBadges.length > 0 && (
                  <div>
                    <p className="text-cream-500 text-xs uppercase mb-2">Approved</p>
                    <div className="flex flex-wrap gap-2">
                      {approvedBadges.map((badge) => (
                        <span 
                          key={badge.id}
                          className="bg-green-600/40 border border-green-500 text-green-400 px-3 py-1.5 text-sm uppercase"
                        >
                          {BADGE_LABELS[badge.badge]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {pendingBadges.length > 0 && (
                  <div>
                    <p className="text-cream-500 text-xs uppercase mb-2">Pending</p>
                    <div className="flex flex-wrap gap-2">
                      {pendingBadges.map((badge) => (
                        <span 
                          key={badge.id}
                          className="bg-cream-800 border border-cream-500 text-cream-100 px-3 py-1.5 text-sm uppercase"
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
              <p className="text-cream-500 text-xs uppercase mb-3">Submission Requirements</p>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${badges.length >= 1 ? 'text-green-400' : 'text-cream-400'}`}>
                  {badges.length >= 1 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  At least 1 badge claimed
                </div>
                <div className={`flex items-center gap-2 text-sm ${project.totalHoursClaimed >= MIN_HOURS_REQUIRED ? 'text-green-400' : 'text-cream-400'}`}>
                  {project.totalHoursClaimed >= MIN_HOURS_REQUIRED ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Minimum {MIN_HOURS_REQUIRED} hours logged ({project.totalHoursClaimed.toFixed(1)}h)
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {!project.submittedAt && (
            <div className="flex gap-3 mb-8">
              <Link
                href={`/dashboard/projects/${project.id}/session/new`}
                className="flex-1 bg-brand-500 hover:bg-brand-400 text-white font-medium py-3 text-center uppercase tracking-wider transition-colors"
              >
                + Log Session
              </Link>
              <Link
                href={`/dashboard/projects/${project.id}/edit`}
                className="flex-1 bg-cream-800 hover:bg-cream-700 text-cream-100 py-3 text-center uppercase tracking-wider transition-colors"
              >
                Edit Project
              </Link>
              <button
                onClick={() => setShowSubmitDialog(true)}
                disabled={submitting || !canSubmit}
                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-cream-700 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-3 uppercase tracking-wider transition-colors cursor-pointer"
              >
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </button>
            </div>
          )}

          {/* Submit Confirmation Dialog */}
          {showSubmitDialog && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-cream-900 border-2 border-cream-600 max-w-md w-full p-6">
                <h3 className="text-cream-50 text-xl uppercase tracking-wide mb-4">Submit for Review?</h3>
                <p className="text-cream-300 text-sm leading-relaxed mb-6">
                  You can&apos;t make any changes to your project once you submit it until a reviewer approves or rejects it. Make sure your project is in a finished and polished state.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSubmitDialog(false)}
                    className="flex-1 bg-cream-800 hover:bg-cream-700 text-cream-100 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitForReview}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Session Devlogs */}
          <div className="bg-cream-900 border-2 border-cream-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-cream-50 text-xl uppercase tracking-wide">Session Devlogs</h2>
              <span className="text-cream-500 text-sm">{project.workSessions.length} sessions</span>
            </div>
            
            {project.workSessions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-cream-500">No sessions logged yet</p>
                <Link
                  href={`/dashboard/projects/${project.id}/session/new`}
                  className="inline-block mt-4 text-brand-400 hover:text-brand-300 transition-colors"
                >
                  Log your first session →
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {project.workSessions.map((ws) => {
                  const isFullyApproved = ws.hoursApproved !== null && ws.hoursApproved >= ws.hoursClaimed;
                  const isPartiallyApproved = ws.hoursApproved !== null && ws.hoursApproved > 0 && ws.hoursApproved < ws.hoursClaimed;
                  const isPending = ws.hoursApproved === null;
                  
                  return (
                  <div 
                    key={ws.id} 
                    className={`bg-cream-950 border-2 p-4 ${
                      isFullyApproved 
                        ? 'border-green-600/50' 
                        : isPartiallyApproved 
                          ? 'border-yellow-600/50' 
                          : 'border-cream-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-cream-500 text-sm">
                          {new Date(ws.createdAt).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                        
                        {isFullyApproved ? (
                          <span className="bg-green-600/30 border border-green-600 text-green-400 px-2 py-0.5 text-sm font-medium">
                            ✓ {ws.hoursApproved}h Approved
                          </span>
                        ) : isPartiallyApproved ? (
                          <span className="bg-yellow-600/30 border border-yellow-600 text-yellow-400 px-2 py-0.5 text-sm font-medium">
                            {ws.hoursApproved}/{ws.hoursClaimed}h Approved
                          </span>
                        ) : (
                          <span className="bg-cream-800 border border-cream-600 text-cream-300 px-2 py-0.5 text-sm">
                            {ws.hoursClaimed}h Pending Review
                          </span>
                        )}
                      </div>
                      
                      {isPending && !project.submittedAt && (
                        <Link
                          href={`/dashboard/projects/${project.id}/session/${ws.id}/edit`}
                          className="bg-brand-500 hover:bg-brand-400 text-white px-3 py-1 text-sm uppercase tracking-wide transition-colors"
                        >
                          Edit
                        </Link>
                      )}
                    </div>
                    
                    {ws.content ? (
                      <div className="text-cream-200 text-sm whitespace-pre-wrap leading-relaxed">
                        {ws.content}
                      </div>
                    ) : (
                      <p className="text-cream-500 text-sm italic">No content recorded</p>
                    )}

                    {ws.media.length > 0 && (
                      <div className="flex flex-col gap-3 mt-4">
                        {ws.media.filter(m => m.type === "IMAGE").map((m) => (
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
                              className="max-w-full max-h-[32rem] border border-cream-600 hover:border-brand-500 transition-colors"
                            />
                          </a>
                        ))}
                        {ws.media.filter(m => m.type === "VIDEO").map((m) => (
                          <video 
                            key={m.id} 
                            src={m.url}
                            controls
                            className="max-w-full max-h-[32rem] border border-cream-600"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <NoiseOverlay />
    </>
  );
}
