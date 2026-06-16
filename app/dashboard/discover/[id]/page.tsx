'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from "@/lib/auth-client";
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { ProjectTag, BadgeType } from "@/app/generated/prisma/enums";
import type { PublicTimelineItem } from '@/app/api/discover/[id]/timeline/route';
import { fixMarkdownImages } from '@/lib/markdown';
import { UnapproveProjectModal } from '@/app/components/admin/UnapproveProjectModal';
import { ConfirmModal } from '@/app/components/ConfirmModal';

const MDPreview = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default.Markdown),
  { ssr: false }
);

interface DiscoverProjectDetail {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  tags: ProjectTag[];
  githubRepo: string | null;
  designStatus: string;
  buildStatus: string;
  hiddenFromGallery: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  badges: { badge: BadgeType; grantedAt: string }[];
  kudosCount: number;
  sessionCount: number;
  hasGivenKudos: boolean;
  isOwner: boolean;
  isAdmin: boolean;
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
  WOODWORKING: "Woodworking",
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 30) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

function UserAvatar({ image }: { name: string | null; image: string | null }) {
  return <img src={image || '/default_slack.png'} alt="" className="w-6 h-6 flex-shrink-0 border-2 border-orange-500" />;
}

function TimelineIcon({ type, decision }: { type: PublicTimelineItem['type']; decision?: string }) {
  const baseClass = "w-8 h-8 flex items-center justify-center flex-shrink-0";

  switch (type) {
    case 'WORK_SESSION':
      return (
        <div className={`${baseClass} bg-blue-500/20 border border-blue-500`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
      );
    case 'SUBMISSION':
      return (
        <div className={`${baseClass} bg-yellow-500/20 border border-yellow-500`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500">
            <polyline points="9 11 12 14 22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
      );
    case 'REVIEW_ACTION':
      if (decision === 'APPROVED') {
        return (
          <div className={`${baseClass} bg-green-500/20 border border-green-500`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
        );
      }
      return (
        <div className={`${baseClass} bg-yellow-500/20 border border-yellow-500`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-600">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
      );
    default:
      return null;
  }
}

function PublicTimeline({ items }: Readonly<{ items: PublicTimelineItem[] }>) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-cream-600">No journal entries yet</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-cream-400" />
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={`${item.type}-${item.at}-${idx}`} className="relative pl-12">
            <div className="absolute left-0 top-0">
              <TimelineIcon
                type={item.type}
                decision={item.type === 'REVIEW_ACTION' ? item.decision : undefined}
              />
            </div>

            {item.type === 'WORK_SESSION' && (
              <div className="bg-cream-100 border border-cream-400 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={item.user.name} image={item.user.image} />
                    <span className="text-brown-800 text-sm font-medium">{item.user.name || 'User'}</span>
                    <span className="text-cream-600 text-sm">added to the journal</span>
                    <span className={`px-2 py-0.5 text-xs uppercase ${
                      item.session.stage === "DESIGN"
                        ? 'bg-purple-100 border border-yellow-500 text-purple-700'
                        : 'bg-blue-100 border border-blue-500 text-blue-700'
                    }`}>
                      {item.session.stage}
                    </span>
                    <span className="text-brown-800 text-sm">
                      {item.session.hoursApproved !== null
                        ? `${Math.round(item.session.hoursApproved * 100) / 100}/${Math.round(item.session.hoursClaimed * 100) / 100}h approved`
                        : `${Math.round(item.session.hoursClaimed * 100) / 100}h logged`}
                    </span>
                  </div>
                  <span className="text-cream-600 text-xs">{formatRelativeTime(item.at)}</span>
                </div>
                {item.session.content && (
                  <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-brown-800 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-400 [&_.wmde-markdown_img]:my-2 [&_.wmde-markdown_p]:my-1" data-color-mode="light">
                    <MDPreview source={fixMarkdownImages(item.session.content)} />
                  </div>
                )}
                {(() => {
                  const extraMedia = item.session.media.filter(m => !item.session.content?.includes(m.url));
                  if (extraMedia.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-2 mt-3">
                      {extraMedia.filter(m => m.type === "IMAGE").map((m) => (
                        <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={m.url}
                            alt="Session media"
                            className="max-w-full max-h-64 border border-cream-400 hover:border-orange-500 transition-colors"
                          />
                        </a>
                      ))}
                      {extraMedia.filter(m => m.type === "VIDEO").map((m) => (
                        <video key={m.id} src={m.url} controls className="max-w-full max-h-64 border border-cream-400" />
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {item.type === 'SUBMISSION' && (
              <div className="bg-cream-100 border border-yellow-500/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={item.user.name} image={item.user.image} />
                    <span className="text-brown-800 text-sm font-medium">{item.user.name || 'User'}</span>
                    <span className="text-yellow-500 text-sm">
                      submitted {item.stage.toLowerCase()} for review
                    </span>
                  </div>
                  <span className="text-cream-600 text-xs">{formatRelativeTime(item.at)}</span>
                </div>
                {item.notes && (
                  <div className="mt-2 wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-brown-800 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-400" data-color-mode="light">
                    <MDPreview source={fixMarkdownImages(item.notes)} />
                  </div>
                )}
              </div>
            )}

            {item.type === 'REVIEW_ACTION' && (
              <div className={`bg-cream-100 border p-4 ${
                item.decision === 'APPROVED'
                  ? 'border-green-600/50'
                  : 'border-yellow-600/50'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserAvatar name={item.reviewerName} image={item.reviewerImage} />
                    <span className="text-brown-800 text-sm font-medium">{item.reviewerName || 'Reviewer'}</span>
                    <span className={`text-sm ${
                      item.decision === 'APPROVED' ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {item.decision === 'APPROVED'
                        ? `approved ${item.stage.toLowerCase()}`
                        : `requested changes for ${item.stage.toLowerCase()}`}
                    </span>
                  </div>
                  <span className="text-cream-600 text-xs">{formatRelativeTime(item.at)}</span>
                </div>
                {item.comments && (
                  <div className="mt-2 wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-brown-800 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-400" data-color-mode="light">
                    <MDPreview source={fixMarkdownImages(item.comments)} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DiscoverProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session } = useSession();

  const [project, setProject] = useState<DiscoverProjectDetail | null>(null);
  const [timeline, setTimeline] = useState<PublicTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kudosLoading, setKudosLoading] = useState(false);
  const [adminActioning, setAdminActioning] = useState(false);
  const [unapproveStage, setUnapproveStage] = useState<'design' | 'build' | null>(null);
  const [partialErrorsModal, setPartialErrorsModal] = useState<{ title: string; errors: string[]; footer?: string } | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [projectRes, timelineRes] = await Promise.all([
          fetch(`/api/discover/${projectId}`),
          fetch(`/api/discover/${projectId}/timeline`),
        ]);

        if (projectRes.ok) {
          setProject(await projectRes.json());
        }
        if (timelineRes.ok) {
          setTimeline(await timelineRes.json());
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [projectId]);

  const handleKudos = async () => {
    if (!session || !project) return;
    setKudosLoading(true);

    try {
      const method = project.hasGivenKudos ? 'DELETE' : 'POST';
      const res = await fetch(`/api/discover/${projectId}/kudos`, { method });

      if (res.ok) {
        const data = await res.json();
        setProject({
          ...project,
          kudosCount: data.kudosCount,
          hasGivenKudos: data.hasGivenKudos,
        });
      }
    } catch (err) {
      console.error('Failed to toggle kudos:', err);
    } finally {
      setKudosLoading(false);
    }
  };

  const handleAdminAction = async (action: string) => {
    if (!project) return;

    if (action === 'unapprove_design') { setUnapproveStage('design'); return; }
    if (action === 'unapprove_build') { setUnapproveStage('build'); return; }

    const confirmMessages: Record<string, string> = {
      hide: 'Hide this project from the public gallery?',
      unhide: 'Unhide this project (make it visible in the gallery again)?',
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
        const data = await res.json().catch(() => ({}));
        alert(data.message || data.error || 'Action failed');
      }
    } catch {
      alert('Action failed');
    } finally {
      setAdminActioning(false);
    }
  };

  const handleUnapproveSuccess = (data: { partialFailures?: string[] } & Record<string, unknown>) => {
    setProject(prev => prev ? { ...prev, ...data } : prev);
    if (Array.isArray(data.partialFailures) && data.partialFailures.length > 0) {
      setPartialErrorsModal({
        title: 'Un-approve completed with errors',
        errors: data.partialFailures,
        footer: 'See the audit log for full details.',
      });
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-brown-800">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-brown-800">Project not found</p>
        <Link href={session ? "/dashboard/discover" : "/"} className="text-orange-500 hover:text-orange-400 mt-2 inline-block">
          ← {session ? 'Back to Discover' : 'Back to Home'}
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href={session ? "/dashboard/discover" : "/"}
        className="inline-flex items-center gap-1 text-brown-800 hover:text-orange-500 text-sm mb-4 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        {session ? 'Back to Discover' : 'Back to Home'}
      </Link>

      {/* Hidden Banner */}
      {project.isAdmin && project.hiddenFromGallery && (
        <div className="bg-red-50 border-2 border-red-300 p-3 mb-4 flex items-center gap-2">
          <span className="text-red-800 text-xs uppercase tracking-wider font-medium">Hidden from Gallery</span>
          <span className="text-red-600 text-xs">This project is not visible to other users</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
        {project.coverImage && (
          <div className="aspect-video max-h-64 overflow-hidden border border-cream-400 mb-4 bg-cream-100">
            <img src={project.coverImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-brown-800 text-2xl uppercase tracking-wide mb-2">
              {project.title}
            </h1>
            <div className="flex items-center gap-3 text-sm">
              <Link href={`/dashboard/profile/${project.user.id}`} className="flex items-center gap-2 hover:text-orange-500 transition-colors">
                <img src={project.user.image || '/default_slack.png'} alt="" className="w-6 h-6 border-2 border-orange-500" />
                <span className="text-brown-800">{project.user.name || 'Anonymous'}</span>
              </Link>
              <span className="text-cream-600">•</span>
              <span className="text-cream-600">{project.sessionCount} journal {project.sessionCount === 1 ? 'entry' : 'entries'}</span>
              <span className="text-cream-600">•</span>
              <span className="text-cream-600">Started {formatRelativeTime(project.createdAt)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {/* Kudos button */}
            {session && !project.isOwner && (
              <button
                onClick={handleKudos}
                disabled={kudosLoading}
                className={`flex items-center gap-2 px-4 py-2 border-2 transition-colors cursor-pointer ${
                  project.hasGivenKudos
                    ? 'bg-red-50 border-red-500 text-red-600 hover:bg-red-100'
                    : 'bg-cream-100 border-cream-400 text-brown-800 hover:border-orange-500 hover:text-orange-500'
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={project.hasGivenKudos ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span className="uppercase text-sm tracking-wider">
                  {kudosLoading ? '...' : project.kudosCount}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Admin Actions */}
        {project.isAdmin && (
          <div className="flex flex-wrap gap-2 mb-4">
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
            {project.designStatus === 'approved' && (
              <button
                onClick={() => handleAdminAction('unapprove_design')}
                disabled={adminActioning}
                className="px-3 py-1.5 text-xs uppercase tracking-wider border border-yellow-600 bg-yellow-600/10 text-yellow-600 hover:bg-yellow-600/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                Unapprove Design{project.buildStatus === 'approved' ? ' + Build' : ''}
              </button>
            )}
            {project.buildStatus === 'approved' && (
              <button
                onClick={() => handleAdminAction('unapprove_build')}
                disabled={adminActioning}
                className="px-3 py-1.5 text-xs uppercase tracking-wider border border-yellow-600 bg-yellow-600/10 text-yellow-600 hover:bg-yellow-600/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                Unapprove Build
              </button>
            )}
          </div>
        )}

        {project.description && (
          <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-brown-800 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit]" data-color-mode="light">
            <MDPreview source={fixMarkdownImages(project.description)} />
          </div>
        )}


        {/* Badges */}
        {project.badges.length > 0 && (
          <div className="mt-4 pt-4 border-t border-cream-400">
            <p className="text-cream-600 text-xs uppercase mb-2">Earned Badges</p>
            <div className="flex flex-wrap gap-2">
              {project.badges.map((b) => (
                <span key={b.badge} className="px-2 py-1 text-xs bg-green-100 border border-green-500 text-green-700">
                  {BADGE_LABELS[b.badge]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Links */}
        {project.githubRepo && (
          <div className="mt-4 pt-4 border-t border-cream-400">
            <a
              href={project.githubRepo}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-orange-500 hover:text-orange-400 text-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View on GitHub
            </a>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <h2 className="text-brown-800 text-xl uppercase tracking-wide mb-4">
          Journal
        </h2>
        <PublicTimeline items={timeline} />
      </div>

      <UnapproveProjectModal
        isOpen={unapproveStage !== null}
        stage={unapproveStage}
        projectId={projectId}
        onClose={() => setUnapproveStage(null)}
        onSuccess={handleUnapproveSuccess}
      />

      <ConfirmModal
        isOpen={!!partialErrorsModal}
        title={partialErrorsModal?.title ?? ''}
        variant="error"
        singleButton
        confirmLabel="OK"
        message={
          <div className="space-y-3">
            <ul className="list-disc list-inside space-y-1">
              {partialErrorsModal?.errors.map((err, i) => (
                <li key={i} className="break-words">{err}</li>
              ))}
            </ul>
            {partialErrorsModal?.footer && (
              <p className="text-cream-200 text-xs uppercase tracking-wide">{partialErrorsModal.footer}</p>
            )}
          </div>
        }
        onConfirm={() => setPartialErrorsModal(null)}
        onCancel={() => setPartialErrorsModal(null)}
      />
    </div>
  );
}
