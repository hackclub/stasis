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
  const thumbnail = project.images[0] || project.coverImage;
  const isApproved = project.designStatus === 'approved';

  return (
    <Link
      href={`/dashboard/discover/${project.id}`}
      className="block bg-cream-100 border-2 border-cream-400 hover:border-orange-500 transition-colors relative"
    >
      {isApproved && (
        <div className="absolute top-2 right-2 z-10 bg-green-500 p-1" title="Design approved">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
      <div className="aspect-video overflow-hidden border-b border-cream-400 bg-cream-100">
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
          <h3 className="text-brown-800 font-medium text-lg leading-tight">
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
          <p className="text-brown-800 text-sm line-clamp-2 mb-3">
            {project.description}
          </p>
        )}


        <div className="flex items-center justify-between text-xs text-cream-600">
          <button
            type="button"
            className="flex items-center gap-2 hover:text-orange-500 transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/dashboard/profile/${project.user.id}`);
            }}
          >
            <img
              src={project.user.image || '/default_slack.png'}
              alt=""
              className="w-5 h-5 border-2 border-orange-500"
            />
            <span>{project.user.name || 'Anonymous'}</span>
          </button>
          <div className="flex items-center gap-3">
            <span>{project.sessionCount} {project.sessionCount === 1 ? 'entry' : 'entries'}</span>
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
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchProjects = useCallback(async (cursor?: string, search?: string) => {
    const isInitial = !cursor;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (search) params.set('search', search);
      const url = `/api/discover${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const sortedProjects = [...data.projects].sort((a: DiscoverProject, b: DiscoverProject) => {
          const aApproved = a.designStatus === 'approved' ? 0 : 1;
          const bApproved = b.designStatus === 'approved' ? 0 : 1;
          return aApproved - bApproved;
        });
        setProjects(prev => isInitial ? sortedProjects : [...prev, ...sortedProjects]);
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
      fetchProjects(undefined, debouncedSearch);
    } else if (!isPending) {
      setLoading(false);
    }
  }, [session, isPending, fetchProjects, debouncedSearch]);

  useEffect(() => {
    if (!nextCursor || loadingMore) return;

    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && nextCursor) {
          fetchProjects(nextCursor, debouncedSearch);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [nextCursor, loadingMore, fetchProjects, debouncedSearch]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-brown-800 text-2xl uppercase tracking-wide mb-2">
          Discover
        </h1>
        <p className="text-brown-800 text-sm">
          Get inspired by seeing what others are building. Projects with a green checkmark have been approved. These projects are a good example for the level of quality we expect for Stasis projects.
        </p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search projects or people..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-cream-100 border-2 border-cream-400 text-brown-800 placeholder:text-cream-500 focus:outline-none focus:border-orange-500 transition-colors"
        />
      </div>

      {projects.length === 0 ? (
        <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
          <p className="text-brown-800">No projects to discover yet.</p>
          <p className="text-cream-600 text-sm mt-1">
            Check back later as more and more projects get built!
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          <div ref={loadMoreRef} className="py-8 flex justify-center">
            {loadingMore && (
              <div className="loader" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
