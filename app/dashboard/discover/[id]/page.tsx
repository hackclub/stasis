'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from "@/lib/auth-client";
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { ProjectTag, BadgeType } from "@/app/generated/prisma/enums";
import type { PublicTimelineItem } from '@/app/api/discover/[id]/timeline/route';

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

function UserAvatar({ name, image }: { name: string | null; image: string | null }) {
  if (image) {
    return <img src={image} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />;
  }
  return (
    <div className="w-6 h-6 rounded-full bg-cream-400 flex items-center justify-center flex-shrink-0">
      <span className="text-cream-800 text-xs">{name?.[0]?.toUpperCase() || '?'}</span>
    </div>
  );
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
          <div key={`${item.session.id}-${idx}`} className="relative pl-12">
            <div className="absolute left-0 top-0">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
            </div>
            <div className="bg-cream-100 border border-cream-400 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <UserAvatar name={item.user.name} image={item.user.image} />
                  <span className="text-cream-800 text-sm font-medium">{item.user.name || 'User'}</span>
                  <span className="text-cream-600 text-sm">added to the journal</span>
                  <span className={`px-2 py-0.5 text-xs uppercase ${
                    item.session.stage === "DESIGN"
                      ? 'bg-purple-100 border border-purple-500 text-purple-700'
                      : 'bg-blue-100 border border-blue-500 text-blue-700'
                  }`}>
                    {item.session.stage}
                  </span>
                  <span className="text-cream-700 text-sm">
                    {item.session.hoursApproved !== null
                      ? `${item.session.hoursApproved}/${item.session.hoursClaimed}h approved`
                      : `${item.session.hoursClaimed}h claimed`}
                  </span>
                </div>
                <span className="text-cream-600 text-xs">{formatRelativeTime(item.at)}</span>
              </div>
              {item.session.content && (
                <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-cream-700 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit] [&_.wmde-markdown_img]:max-h-64 [&_.wmde-markdown_img]:border [&_.wmde-markdown_img]:border-cream-400 [&_.wmde-markdown_img]:my-2 [&_.wmde-markdown_p]:my-1" data-color-mode="light">
                  <MDPreview source={item.session.content} />
                </div>
              )}
              {item.session.media.length > 0 && item.session.media.some(m => !item.session.content?.includes(m.url)) && (
                <div className="flex flex-col gap-2 mt-3">
                  {item.session.media.filter(m => m.type === "IMAGE").map((m) => (
                    <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={m.url}
                        alt="Session media"
                        className="max-w-full max-h-64 border border-cream-400 hover:border-brand-500 transition-colors"
                      />
                    </a>
                  ))}
                  {item.session.media.filter(m => m.type === "VIDEO").map((m) => (
                    <video key={m.id} src={m.url} controls className="max-w-full max-h-64 border border-cream-400" />
                  ))}
                </div>
              )}
            </div>
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

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-cream-700">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-cream-700">Project not found</p>
        <Link href="/dashboard/discover" className="text-brand-500 hover:text-brand-400 mt-2 inline-block">
          ← Back to Discover
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back link */}
      <Link
        href="/dashboard/discover"
        className="inline-flex items-center gap-1 text-cream-700 hover:text-brand-500 text-sm mb-4 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Back to Discover
      </Link>

      {/* Header */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6 mb-6">
        {project.coverImage && (
          <div className="aspect-video max-h-64 overflow-hidden border border-cream-400 mb-4">
            <img src={project.coverImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-cream-800 text-2xl uppercase tracking-wide mb-2">
              {project.title}
            </h1>
            <div className="flex items-center gap-3 text-sm">
              <Link href={`/dashboard/profile/${project.user.id}`} className="flex items-center gap-2 hover:text-brand-500 transition-colors">
                {project.user.image ? (
                  <img src={project.user.image} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-cream-400 flex items-center justify-center">
                    <span className="text-cream-800 text-xs">{project.user.name?.[0]?.toUpperCase() || '?'}</span>
                  </div>
                )}
                <span className="text-cream-700">{project.user.name || 'Anonymous'}</span>
              </Link>
              <span className="text-cream-600">•</span>
              <span className="text-cream-600">{project.sessionCount} journal entries</span>
              <span className="text-cream-600">•</span>
              <span className="text-cream-600">Started {formatRelativeTime(project.createdAt)}</span>
            </div>
          </div>

          {/* Kudos button */}
          {!project.isOwner && (
            <button
              onClick={handleKudos}
              disabled={kudosLoading}
              className={`flex items-center gap-2 px-4 py-2 border-2 transition-colors cursor-pointer ${
                project.hasGivenKudos
                  ? 'bg-red-50 border-red-500 text-red-600 hover:bg-red-100'
                  : 'bg-cream-100 border-cream-400 text-cream-700 hover:border-brand-500 hover:text-brand-500'
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

        {project.description && (
          <div className="wmde-markdown-var [&_.wmde-markdown]:!bg-transparent [&_.wmde-markdown]:!text-cream-700 [&_.wmde-markdown]:!text-sm [&_.wmde-markdown]:!font-[inherit]" data-color-mode="light">
            <MDPreview source={project.description} />
          </div>
        )}

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {project.tags.map((tag) => (
              <span key={tag} className="px-2 py-1 text-xs bg-cream-200 border border-cream-400 text-cream-700 uppercase">
                {TAG_LABELS[tag]}
              </span>
            ))}
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
              className="inline-flex items-center gap-2 text-brand-500 hover:text-brand-400 text-sm"
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
        <h2 className="text-cream-800 text-xl uppercase tracking-wide mb-4">
          Journal
        </h2>
        <PublicTimeline items={timeline} />
      </div>
    </div>
  );
}
