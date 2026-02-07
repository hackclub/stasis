'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from "@/lib/auth-client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectTag } from "@/app/generated/prisma/enums";

interface DiscoverProject {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  images: string[];
  tags: ProjectTag[];
  designStatus: string;
  buildStatus: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  kudosCount: number;
  sessionCount: number;
  lastActivity: string;
  hasGivenKudos: boolean;
}

const TAG_LABELS: Record<ProjectTag, string> = {
  PCB: "PCB",
  ROBOT: "Robot",
  CAD: "CAD",
  ARDUINO: "Arduino",
  RASPBERRY_PI: "Raspberry Pi",
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

function ProjectCard({ project }: Readonly<{ project: DiscoverProject }>) {
  const router = useRouter();
  const thumbnail = project.coverImage || project.images[0];
  
  return (
    <Link
      href={`/dashboard/discover/${project.id}`}
      className="block bg-cream-100 border-2 border-cream-400 hover:border-brand-500 transition-colors"
    >
      <div className="aspect-video overflow-hidden border-b border-cream-400 bg-cream-200">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-cream-500 text-sm uppercase tracking-wider">No picture</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-cream-800 font-medium text-lg leading-tight">
            {project.title}
          </h3>
          <div className="flex items-center gap-1 text-cream-600 flex-shrink-0">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill={project.hasGivenKudos ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              className={project.hasGivenKudos ? "text-red-500" : ""}
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="text-xs">{project.kudosCount}</span>
          </div>
        </div>

        {project.description && (
          <p className="text-cream-700 text-sm line-clamp-2 mb-3">
            {project.description}
          </p>
        )}

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs bg-cream-200 border border-cream-400 text-cream-700"
              >
                {TAG_LABELS[tag]}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-cream-600">
          <button
            type="button"
            className="flex items-center gap-2 hover:text-brand-500 transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/dashboard/profile/${project.user.id}`);
            }}
          >
            {project.user.image ? (
              <img
                src={project.user.image}
                alt=""
                className="w-5 h-5 rounded-full"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-cream-400 flex items-center justify-center">
                <span className="text-cream-800 text-[10px]">
                  {project.user.name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
            )}
            <span>{project.user.name || 'Anonymous'}</span>
          </button>
          <div className="flex items-center gap-3">
            <span>{project.sessionCount} entries</span>
            <span>{formatRelativeTime(project.lastActivity)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function DiscoverPage() {
  const { data: session, isPending } = useSession();
  const [projects, setProjects] = useState<DiscoverProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const fetchProjects = useCallback(async (cursor?: string) => {
    const isInitial = !cursor;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const url = cursor ? `/api/discover?cursor=${cursor}` : '/api/discover';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setProjects(prev => isInitial ? data.projects : [...prev, ...data.projects]);
        setNextCursor(data.nextCursor);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      if (isInitial) setLoading(false);
      else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchProjects();
    } else if (!isPending) {
      setLoading(false);
    }
  }, [session, isPending, fetchProjects]);

  useEffect(() => {
    if (!nextCursor || loadingMore) return;

    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && nextCursor) {
          fetchProjects(nextCursor);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [nextCursor, loadingMore, fetchProjects]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-cream-700">Loading projects...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-cream-800 text-2xl uppercase tracking-wide mb-2">
          Discover
        </h1>
        <p className="text-cream-700 text-sm">
          Get inspired by seeing what others are building.
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
          <p className="text-cream-700">No projects to discover yet.</p>
          <p className="text-cream-600 text-sm mt-1">
            Check back later as more projects get approved!
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          <div ref={loadMoreRef} className="py-4 text-center">
            {loadingMore && (
              <p className="text-cream-700 text-sm">Loading more...</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
