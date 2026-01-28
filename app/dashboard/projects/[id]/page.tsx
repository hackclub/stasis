'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';

import { StageProgress } from '@/app/components/projects/StageProgress';
import { Timeline } from '@/app/components/projects/Timeline';
import { OnboardingTutorial, TutorialHelpButton } from '@/app/components/OnboardingTutorial';
import Link from 'next/link';
import { ProjectTag } from "@/app/generated/prisma/enums";
import type { TimelineItem } from '@/app/api/projects/[id]/timeline/route';

type ProjectStatus = "draft" | "in_review" | "approved" | "rejected" | "update_requested";

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
  stage: "DESIGN" | "BUILD";
  createdAt: string;
  media: SessionMedia[];
}

interface ProjectBadge {
  id: string;
  badge: BadgeType;
  claimedAt: string;
  grantedAt: string | null;
}

interface BOMItem {
  id: string;
  name: string;
  purpose: string | null;
  costPerItem: number;
  quantity: number;
  link: string | null;
  distributor: string | null;
  status: "pending" | "approved" | "rejected";
  reviewComments: string | null;
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
  githubRepo: string | null;
  
  // Stage-based status
  designStatus: ProjectStatus;
  designSubmissionNotes: string | null;
  designReviewComments: string | null;
  designReviewedAt: string | null;
  designReviewedBy: string | null;
  
  buildStatus: ProjectStatus;
  buildSubmissionNotes: string | null;
  buildReviewComments: string | null;
  buildReviewedAt: string | null;
  buildReviewedBy: string | null;
  
  createdAt: string;
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

const MIN_HOURS_REQUIRED = 4;

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDesignSubmitDialog, setShowDesignSubmitDialog] = useState(false);
  const [showBuildSubmitDialog, setShowBuildSubmitDialog] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  
  const [bomForm, setBomForm] = useState({
    name: '',
    purpose: '',
    costPerItem: '',
    quantity: '',
    link: '',
    distributor: '',
  });
  const [addingBom, setAddingBom] = useState(false);
  const [deletingBomId, setDeletingBomId] = useState<string | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);

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

    async function fetchTimeline() {
      try {
        const res = await fetch(`/api/projects/${projectId}/timeline`);
        if (res.ok) {
          const data = await res.json();
          setTimelineItems(data);
        }
      } catch (err) {
        console.error('Failed to fetch timeline:', err);
      }
    }

    if (session) {
      fetchProject();
      fetchTimeline();
    } else if (!isPending) {
      router.push('/dashboard');
    }
  }, [session, isPending, projectId, router]);

  const handleSubmitStage = async (stage: "design" | "build") => {
    if (!project) return;
    if (stage === "design") {
      setShowDesignSubmitDialog(false);
    } else {
      setShowBuildSubmitDialog(false);
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      
      if (res.ok) {
        const [updatedRes, timelineRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/timeline`),
        ]);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
        if (timelineRes.ok) {
          setTimelineItems(await timelineRes.json());
        }
      } else {
        const data = await res.json();
        alert(data.error || `Failed to submit ${stage} for review`);
      }
    } catch (error) {
      console.error(`Failed to submit ${stage} for review:`, error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitDesign = () => handleSubmitStage("design");
  const handleSubmitBuild = () => handleSubmitStage("build");

  // Computed values for stage requirements
  const designSessions = project?.workSessions.filter(s => s.stage === "DESIGN") ?? [];
  const buildSessions = project?.workSessions.filter(s => s.stage === "BUILD") ?? [];
  const totalBuildHours = buildSessions.reduce((acc, s) => acc + s.hoursClaimed, 0);
  
  const canSubmitDesign = project && 
    (project.designStatus === "draft" || project.designStatus === "rejected") &&
    project.description?.trim() &&
    project.bomItems.length > 0 &&
    designSessions.length > 0 &&
    project.githubRepo &&
    project.badges.length > 0;
    
  const canSubmitBuild = project &&
    project.designStatus === "approved" &&
    (project.buildStatus === "draft" || project.buildStatus === "rejected") &&
    totalBuildHours >= MIN_HOURS_REQUIRED;

  const handleRequestUpdate = async () => {
    if (!project) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: "build" }),
      });
      
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to request update');
      }
    } catch (error) {
      console.error('Failed to request update:', error);
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

  const handleAddBomItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !bomForm.name || !bomForm.costPerItem || !bomForm.quantity) return;
    
    setAddingBom(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/bom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bomForm.name,
          purpose: bomForm.purpose || null,
          costPerItem: parseFloat(bomForm.costPerItem),
          quantity: parseInt(bomForm.quantity, 10),
          link: bomForm.link || null,
          distributor: bomForm.distributor || null,
        }),
      });
      
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
        setBomForm({ name: '', purpose: '', costPerItem: '', quantity: '', link: '', distributor: '' });
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add BOM item');
      }
    } catch (error) {
      console.error('Failed to add BOM item:', error);
      alert('Failed to add BOM item');
    } finally {
      setAddingBom(false);
    }
  };

  const handleDeleteBomItem = async (bomId: string) => {
    if (!project) return;
    
    setDeletingBomId(bomId);
    try {
      const res = await fetch(`/api/projects/${project.id}/bom/${bomId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        const updatedRes = await fetch(`/api/projects/${projectId}`);
        if (updatedRes.ok) {
          setProject(await updatedRes.json());
        }
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete BOM item');
      }
    } catch (error) {
      console.error('Failed to delete BOM item:', error);
      alert('Failed to delete BOM item');
    } finally {
      setDeletingBomId(null);
    }
  };

  if (isPending || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-cream-700">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const badges = project.badges ?? [];
  const approvedBadges = badges.filter(b => b.grantedAt !== null);
  const pendingBadges = badges.filter(b => b.grantedAt === null);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Onboarding Tutorial */}
      <OnboardingTutorial type="project" forceShow={showTutorial} onComplete={() => setShowTutorial(false)} />
      <TutorialHelpButton onClick={() => setShowTutorial(true)} />

      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/dashboard" className="text-cream-700 hover:text-brand-400 transition-colors flex items-center gap-2 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Projects
        </Link>
      </div>

      <div>
          {/* Project Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h1 className="text-brand-500 text-3xl uppercase tracking-wide mb-2">{project.title}</h1>
                {project.description && (
                  <p data-tutorial="description" className="text-cream-800 text-lg">{project.description}</p>
                )}
              </div>
              
              {/* Project Image / Upload */}
              <label className="w-48 h-32 bg-cream-100 border-2 border-dashed border-cream-400 hover:border-brand-500 hover:bg-cream-200 flex flex-col items-center justify-center flex-shrink-0 transition-colors cursor-pointer group relative overflow-hidden">
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
                  <span className="text-cream-700 text-xs uppercase">Uploading...</span>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cream-700 group-hover:text-brand-500 mb-1">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span className="text-cream-700 group-hover:text-brand-500 text-xs uppercase font-medium">Upload Screenshot</span>
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
                  className={`text-xs px-2 py-1 uppercase ${
                    tag === 'CAD' 
                      ? 'bg-orange-500 text-white' 
                      : 'bg-cream-200 text-cream-700'
                  }`}
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
            <div className="mt-4 bg-cream-200/80 border border-cream-300 p-4 w-fit">
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-cream-700">Hours Claimed:</span>{' '}
                  <span className="text-cream-800">{project.totalHoursClaimed.toFixed(1)}h</span>
                </div>
                <div>
                  <span className="text-cream-700">Hours Approved:</span>{' '}
                  <span className="text-brand-500">{project.totalHoursApproved.toFixed(1)}h</span>
                </div>
              </div>

              {/* GitHub Repo */}
              <div data-tutorial="github" className="mt-3 text-sm">
                <span className="text-cream-700">GitHub Repo:</span>{' '}
                {project.githubRepo ? (
                  <a 
                    href={project.githubRepo} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-brand-500 hover:text-brand-400 underline"
                  >
                    {project.githubRepo}
                  </a>
                ) : (
                  <span className="text-cream-700">
                    Not set.{' '}
                    <Link href={`/dashboard/projects/${project.id}/edit`} className="text-brand-500 hover:text-brand-400 underline">
                      Add one
                    </Link>
                  </span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            {(project.designStatus !== "in_review" && project.buildStatus !== "in_review") && (
              <div className="mt-6">
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/dashboard/projects/${project.id}/session/new`}
                    data-tutorial="actions"
                    className="inline-block bg-brand-500 hover:bg-brand-400 text-white font-medium py-3 px-6 text-center uppercase tracking-wider transition-colors"
                  >
                    + New Journal Entry
                  </Link>
                  <button
                    data-tutorial="timelapse"
                    className="inline-flex items-center gap-2 bg-cream-300 hover:bg-cream-400 text-cream-800 font-medium py-3 px-6 text-center uppercase tracking-wider transition-colors cursor-pointer border border-cream-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Start Timelapse
                  </button>
                </div>
                <p className="text-cream-600 text-xs mt-2">
                  Planning to work 7+ hours? You&apos;ll need to include a timelapse recording of your session.
                </p>
              </div>
            )}
          </div>

          {/* Badges Section */}
          <div data-tutorial="badges" className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
            <h2 className="text-cream-800 text-xl uppercase tracking-wide mb-4">Badges</h2>
            
            {badges.length === 0 ? (
              <p className="text-cream-700 text-sm">
                No badges claimed yet.{' '}
                <Link href={`/dashboard/projects/${project.id}/edit`} className="text-brand-500 hover:text-brand-400 underline">
                  You should claim some
                </Link>
              </p>
            ) : (
              <div className="space-y-4">
                {approvedBadges.length > 0 && (
                  <div>
                    <p className="text-cream-700 text-xs uppercase mb-2">Approved</p>
                    <div className="flex flex-wrap gap-2">
                      {approvedBadges.map((badge) => (
                        <span 
                          key={badge.id}
                          className="bg-green-100 border border-green-500 text-green-700 px-3 py-1.5 text-sm uppercase"
                        >
                          {BADGE_LABELS[badge.badge]}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {pendingBadges.length > 0 && (
                  <div>
                    <p className="text-cream-700 text-xs uppercase mb-2">Pending</p>
                    <div className="flex flex-wrap gap-2">
                      {pendingBadges.map((badge) => (
                        <span 
                          key={badge.id}
                          className="bg-cream-200 border border-cream-500 text-cream-800 px-3 py-1.5 text-sm uppercase"
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

          {/* Stage Progress */}
          <div data-tutorial="stage-progress" className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
            <StageProgress 
              designStatus={project.designStatus} 
              buildStatus={project.buildStatus}
            />
            
            {/* Design Stage Review Comments */}
            {project.designStatus === "rejected" && project.designReviewComments && (
              <div className="mt-4 bg-red-600/20 border border-red-600 p-3">
                <p className="text-red-500/80 text-xs uppercase mb-1">Design Feedback</p>
                <p className="text-red-600 text-sm whitespace-pre-wrap">{project.designReviewComments}</p>
              </div>
            )}
            
            {/* Build Stage Review Comments */}
            {project.buildStatus === "rejected" && project.buildReviewComments && (
              <div className="mt-4 bg-red-600/20 border border-red-600 p-3">
                <p className="text-red-500/80 text-xs uppercase mb-1">Build Feedback</p>
                <p className="text-red-600 text-sm whitespace-pre-wrap">{project.buildReviewComments}</p>
              </div>
            )}
          </div>

          {/* Stage Requirements */}
          {project.designStatus !== "approved" && (
            <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-6">
              <p className="text-cream-700 text-xs uppercase mb-3">Design Stage Requirements</p>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${project.description?.trim() ? 'text-green-500' : 'text-cream-700'}`}>
                  {project.description?.trim() ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Project description
                </div>
                <div className={`flex items-center gap-2 text-sm ${project.bomItems.length > 0 ? 'text-green-500' : 'text-cream-700'}`}>
                  {project.bomItems.length > 0 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  At least 1 BOM item ({project.bomItems.length} added)
                </div>
                <div className={`flex items-center gap-2 text-sm ${designSessions.length > 0 ? 'text-green-500' : 'text-cream-700'}`}>
                  {designSessions.length > 0 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  At least 1 work session ({designSessions.length} logged)
                </div>
                <div className={`flex items-center gap-2 text-sm ${project.githubRepo ? 'text-green-500' : 'text-cream-700'}`}>
                  {project.githubRepo ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  GitHub repo linked
                </div>
                <div className={`flex items-center gap-2 text-sm ${project.badges.length > 0 ? 'text-green-500' : 'text-cream-700'}`}>
                  {project.badges.length > 0 ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  At least 1 badge claimed ({project.badges.length} claimed)
                </div>
              </div>
            </div>
          )}

          {project.designStatus === "approved" && project.buildStatus !== "approved" && (
            <div className="bg-cream-100 border-2 border-cream-400 p-4 mb-6">
              <p className="text-cream-700 text-xs uppercase mb-3">Build Stage Requirements</p>
              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-sm ${totalBuildHours >= MIN_HOURS_REQUIRED ? 'text-green-500' : 'text-cream-700'}`}>
                  {totalBuildHours >= MIN_HOURS_REQUIRED ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span className="w-3.5 h-3.5 border border-cream-500 inline-block" />
                  )}
                  Minimum {MIN_HOURS_REQUIRED} build hours ({totalBuildHours.toFixed(1)}h logged)
                </div>
              </div>
            </div>
          )}

          {/* Bill of Materials */}
          <div data-tutorial="bom" className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
            <h2 className="text-cream-800 text-xl uppercase tracking-wide mb-4">Bill of Materials</h2>
            
            <div className="bg-blue-600/20 border border-blue-600 p-3 mb-4">
              <p className="text-blue-600 text-sm">
                You earn $5/hr for approved hours. Your BOM items will be reviewed when you submit your project, and you&apos;ll receive a grant card to purchase approved materials.
              </p>
            </div>

            {(project.bomItems ?? []).length > 0 ? (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-cream-400">
                      <th className="text-left text-cream-700 uppercase text-xs py-2 pr-3">Name</th>
                      <th className="text-left text-cream-700 uppercase text-xs py-2 pr-3">Purpose</th>
                      <th className="text-right text-cream-700 uppercase text-xs py-2 pr-3">Cost (USD)</th>
                      <th className="text-right text-cream-700 uppercase text-xs py-2 pr-3">Qty</th>
                      <th className="text-right text-cream-700 uppercase text-xs py-2 pr-3">Total (USD)</th>
                      <th className="text-left text-cream-700 uppercase text-xs py-2 pr-3">Link</th>
                      <th className="text-left text-cream-700 uppercase text-xs py-2 pr-3">Distributor</th>
                      {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "approved") && (
                        <th className="text-center text-cream-700 uppercase text-xs py-2"></th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(project.bomItems ?? []).map((item) => (
                      <tr key={item.id} className="border-b border-cream-300">
                        <td className="text-cream-800 py-2 pr-3">{item.name}</td>
                        <td className="text-cream-800 py-2 pr-3">{item.purpose || '-'}</td>
                        <td className="text-cream-800 py-2 pr-3 text-right">${item.costPerItem.toFixed(2)}</td>
                        <td className="text-cream-800 py-2 pr-3 text-right">{item.quantity}</td>
                        <td className="text-cream-800 py-2 pr-3 text-right">${(item.costPerItem * item.quantity).toFixed(2)}</td>
                        <td className="py-2 pr-3">
                          {item.link ? (
                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:text-brand-400 underline">
                              Link to Listing
                            </a>
                          ) : '-'}
                        </td>
                        <td className="text-cream-800 py-2 pr-3">{item.distributor || '-'}</td>
                        {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "approved") && (
                          <td className="py-2 text-center">
                            <button
                              onClick={() => handleDeleteBomItem(item.id)}
                              disabled={deletingBomId === item.id}
                              className="text-red-500 hover:text-red-400 disabled:text-cream-400 transition-colors cursor-pointer"
                            >
                              {deletingBomId === item.id ? '...' : '✕'}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                <div className="flex flex-col items-end gap-1 mt-3 pt-3 border-t border-cream-400">
                  <div className="flex items-center">
                    <span className="text-cream-700 text-sm uppercase mr-3">Total Estimated Cost (USD):</span>
                    <span className="text-cream-800 font-medium">
                      ${(project.bomItems ?? []).reduce((sum, item) => sum + item.costPerItem * item.quantity, 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-cream-700 text-xs mr-3">Hours needed at $5/hr:</span>
                    <span className="text-cream-700 text-sm">
                      {(Math.ceil((project.bomItems ?? []).reduce((sum, item) => sum + item.costPerItem * item.quantity, 0) / 5 * 4) / 4).toFixed(2)}h
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-cream-700 text-sm mb-4">No items added yet.</p>
            )}

            {(project.designStatus === "draft" || project.designStatus === "rejected" || project.designStatus === "approved") && (
              <form onSubmit={handleAddBomItem} className="border-t border-cream-400 pt-4">
                <p className="text-cream-700 text-xs uppercase mb-3">Add New Item</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-cream-700 text-xs uppercase block mb-1">Name *</label>
                    <input
                      type="text"
                      value={bomForm.name}
                      onChange={(e) => setBomForm({ ...bomForm, name: e.target.value })}
                      required
                      className="w-full bg-white border-2 border-cream-400 text-cream-800 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      placeholder="Component name"
                    />
                  </div>
                  <div>
                    <label className="text-cream-700 text-xs uppercase block mb-1">Purpose *</label>
                    <input
                      type="text"
                      value={bomForm.purpose}
                      onChange={(e) => setBomForm({ ...bomForm, purpose: e.target.value })}
                      required
                      className="w-full bg-white border-2 border-cream-400 text-cream-800 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      placeholder="What is it for?"
                    />
                  </div>
                  <div>
                    <label className="text-cream-700 text-xs uppercase block mb-1">Cost Per Item (USD) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={bomForm.costPerItem}
                      onChange={(e) => setBomForm({ ...bomForm, costPerItem: e.target.value })}
                      required
                      className="w-full bg-white border-2 border-cream-400 text-cream-800 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-cream-700 text-xs uppercase block mb-1">Quantity *</label>
                    <input
                      type="number"
                      min="1"
                      value={bomForm.quantity}
                      onChange={(e) => setBomForm({ ...bomForm, quantity: e.target.value })}
                      required
                      className="w-full bg-white border-2 border-cream-400 text-cream-800 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="text-cream-700 text-xs uppercase block mb-1">Link</label>
                    <input
                      type="url"
                      value={bomForm.link}
                      onChange={(e) => setBomForm({ ...bomForm, link: e.target.value })}
                      className="w-full bg-white border-2 border-cream-400 text-cream-800 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="text-cream-700 text-xs uppercase block mb-1">Distributor *</label>
                    <input
                      type="text"
                      value={bomForm.distributor}
                      onChange={(e) => setBomForm({ ...bomForm, distributor: e.target.value })}
                      required
                      className="w-full bg-white border-2 border-cream-400 text-cream-800 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                      placeholder="e.g. Digikey, Amazon"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={addingBom || !bomForm.name || !bomForm.purpose || !bomForm.costPerItem || !bomForm.quantity || !bomForm.distributor}
                  className="bg-brand-500 hover:bg-brand-400 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white px-4 py-2 uppercase text-sm tracking-wider transition-colors cursor-pointer"
                >
                  {addingBom ? 'Adding...' : '+ Add Item'}
                </button>
              </form>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mb-8">
            {/* Edit button */}
            {(project.designStatus !== "in_review" && project.buildStatus !== "in_review") && (
              <Link
                href={`/dashboard/projects/${project.id}/edit`}
                className="flex-1 min-w-[200px] border-2 border-cream-500 bg-cream-100 hover:bg-cream-200 text-cream-900 py-3 text-center uppercase tracking-wider transition-colors font-medium"
              >
                Edit Project
              </Link>
            )}
            
            {/* Design Stage Submit Button */}
            {(project.designStatus === "draft" || project.designStatus === "rejected") && (
              <button
                data-tutorial="submit"
                onClick={() => setShowDesignSubmitDialog(true)}
                disabled={submitting || !canSubmitDesign}
                className="flex-1 min-w-[200px] bg-green-600 hover:bg-green-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-3 uppercase tracking-wider transition-colors cursor-pointer"
              >
                {submitting ? 'Submitting...' : (project.designStatus === "rejected" ? 'Resubmit Design' : 'Submit Design for Review')}
              </button>
            )}
            
            {/* Build Stage Submit Button */}
            {project.designStatus === "approved" && (project.buildStatus === "draft" || project.buildStatus === "rejected") && (
              <button
                data-tutorial="submit"
                onClick={() => setShowBuildSubmitDialog(true)}
                disabled={submitting || !canSubmitBuild}
                className="flex-1 min-w-[200px] bg-green-600 hover:bg-green-500 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white py-3 uppercase tracking-wider transition-colors cursor-pointer"
              >
                {submitting ? 'Submitting...' : (project.buildStatus === "rejected" ? 'Resubmit Build' : 'Submit Build for Review')}
              </button>
            )}
          </div>

          {/* Design Submit Confirmation Dialog */}
          {showDesignSubmitDialog && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-cream-100 border-2 border-cream-400 max-w-md w-full p-6">
                <h3 className="text-cream-800 text-xl uppercase tracking-wide mb-4">Submit Design for Review?</h3>
                <p className="text-cream-700 text-sm leading-relaxed mb-4">
                  Your design (project details and BOM) will be reviewed. You can still make changes while waiting for approval.
                </p>
                <p className="text-red-500 text-sm font-medium mb-6">
                  IMPORTANT: Before submitting, please make sure to read the{' '}
                  <Link href="/dashboard/guides#submission-guidelines" className="underline hover:text-red-400">
                    submission guidelines
                  </Link>
                  .
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDesignSubmitDialog(false)}
                    className="flex-1 bg-cream-200 hover:bg-cream-300 text-cream-800 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitDesign}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Submit Design
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Build Submit Confirmation Dialog */}
          {showBuildSubmitDialog && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="bg-cream-100 border-2 border-cream-400 max-w-md w-full p-6">
                <h3 className="text-cream-800 text-xl uppercase tracking-wide mb-4">Submit Build for Review?</h3>
                <p className="text-cream-700 text-sm leading-relaxed mb-4">
                  Your build work will be reviewed. Once approved, your badges will be granted and hours finalized.
                </p>
                <p className="text-red-500 text-sm font-medium mb-6">
                  IMPORTANT: Before submitting, please make sure to read the{' '}
                  <Link href="/dashboard/guides#submission-guidelines" className="underline hover:text-red-400">
                    submission guidelines
                  </Link>
                  .
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowBuildSubmitDialog(false)}
                    className="flex-1 bg-cream-200 hover:bg-cream-300 text-cream-800 py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitBuild}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Submit Build
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Timeline */}
        <div data-tutorial="timeline" className="bg-cream-100 border-2 border-cream-400 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-cream-800 text-xl uppercase tracking-wide">Timeline</h2>
          </div>
          <Timeline items={timelineItems} projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
