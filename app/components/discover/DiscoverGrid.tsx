'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ProjectTag, BadgeType } from "@/app/generated/prisma/enums";
import type { DiscoverSort, DiscoverStatus } from "@/app/api/discover/route";
import { VALID_BADGE_TYPES } from "@/lib/badges";
import { BadgePicker } from "./BadgePicker";

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

// Hosts allowed in next.config `images.remotePatterns`. Their originals are
// often multi-MB and served with no-store, so going through the optimizer
// (resized, WebP, cached) is the difference between a slow and a snappy grid.
const OPTIMIZABLE_HOSTS = new Set([
  'stasis.hackclub-assets.com',
  'stasis-staging.hackclub-assets.com',
  'blueprint.hackclub.com',
  'cdn.hackclub.com',
  'user-cdn.hackclub-assets.com',
  'files.catbox.moe',
]);

function isOptimizable(url: string): boolean {
  try {
    return OPTIMIZABLE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

// Survives client-side navigation, so going back from a project restores the
// list (and scroll position) instantly instead of refetching from scratch.
const listCache = new Map<string, { projects: DiscoverProject[]; nextCursor: string | null }>();

function ProjectCard({ project, basePath }: Readonly<{ project: DiscoverProject; basePath: string }>) {
  const router = useRouter();
  const thumbnail = project.images[0] || project.coverImage;
  const isApproved = project.designStatus === 'approved';
  const isBuilt = project.buildStatus === 'approved';

  return (
    <Link
      href={`${basePath}/${project.id}`}
      className="block bg-cream-100 border-2 border-cream-400 hover:border-orange-500 transition-colors relative"
    >
      {isApproved && (
        <div
          className="absolute top-2 right-2 z-10 bg-green-500 p-1 flex items-center gap-1"
          title={isBuilt ? 'Design and build approved' : 'Design approved'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {isBuilt && (
            <span className="text-white text-xs uppercase tracking-wider font-bold pr-1">Built</span>
          )}
        </div>
      )}
      <div className="relative aspect-video overflow-hidden border-b border-cream-400 bg-cream-100">
        {thumbnail ? (
          isOptimizable(thumbnail) ? (
            <Image
              src={thumbnail}
              alt=""
              fill
              sizes="(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          ) : (
            <img
              src={thumbnail}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          )
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

const SORT_OPTIONS: { value: DiscoverSort; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'recent', label: 'Recent' },
];

const STATUS_OPTIONS: { value: DiscoverStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'built', label: 'Built' },
];

function Segmented<T extends string>({ label, value, options, onChange }: Readonly<{
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-cream-600 text-xs uppercase tracking-wider">{label}</span>
      <div className="flex border-2 border-cream-400" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 text-xs uppercase tracking-wider transition-colors cursor-pointer ${
              value === o.value
                ? 'bg-orange-500 text-white'
                : 'bg-cream-100 text-brown-800 hover:text-orange-500'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function readParam<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * The project gallery, shared by the logged-in Discover tab and the public
 * /explore page. Filters live in the query string so a filtered view can be
 * linked directly (e.g. /explore?status=built).
 */
export default function DiscoverGrid({ basePath, heading, intro }: Readonly<{
  basePath: string;
  heading: string;
  intro: React.ReactNode;
}>) {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [sort, setSort] = useState<DiscoverSort>(() =>
    readParam(searchParams.get('sort'), SORT_OPTIONS.map(o => o.value), 'top'));
  const [status, setStatus] = useState<DiscoverStatus>(() =>
    readParam(searchParams.get('status'), STATUS_OPTIONS.map(o => o.value), 'all'));
  const [badge, setBadge] = useState<BadgeType | ''>(() =>
    readParam<BadgeType | ''>(searchParams.get('badge'), VALID_BADGE_TYPES, ''));
  const cacheKey = `${debouncedSearch}|${sort}|${status}|${badge}`;
  const [cached] = useState(() => listCache.get(cacheKey));
  // The filters the cached list belongs to; once they change, fetch normally.
  const restoredKey = useRef<string | null>(cached ? cacheKey : null);
  const [projects, setProjects] = useState<DiscoverProject[]>(cached?.projects ?? []);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(cached?.nextCursor ?? null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Mirror filters into the URL without a navigation, so the view is shareable.
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (sort !== 'top') params.set('sort', sort);
    if (status !== 'all') params.set('status', status);
    if (badge) params.set('badge', badge);
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [debouncedSearch, sort, status, badge]);

  const fetchProjects = useCallback(async (cursor?: string) => {
    const isInitial = !cursor;
    const requestId = ++requestRef.current;
    if (isInitial) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('sort', sort);
      params.set('status', status);
      if (badge) params.set('badge', badge);
      const res = await fetch(`/api/discover?${params}`);
      // A newer request (filters changed mid-flight) owns the list now.
      if (requestId !== requestRef.current) return;
      if (res.ok) {
        const data = await res.json();
        setProjects(prev => {
          const list = isInitial ? data.projects : [...prev, ...data.projects];
          listCache.set(cacheKey, { projects: list, nextCursor: data.nextCursor });
          return list;
        });
        setNextCursor(data.nextCursor);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [debouncedSearch, sort, status, badge, cacheKey]);

  useEffect(() => {
    if (restoredKey.current === cacheKey) return;
    restoredKey.current = null;
    fetchProjects();
  }, [fetchProjects, cacheKey]);

  useEffect(() => {
    if (!nextCursor || loadingMore || loading) return;

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
  }, [nextCursor, loadingMore, loading, fetchProjects]);

  const isFiltered = !!debouncedSearch || status !== 'all' || !!badge;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-brown-800 text-2xl uppercase tracking-wide mb-2">
          {heading}
        </h1>
        <div className="text-brown-800 text-sm">{intro}</div>
      </div>

      <div className="mb-6 space-y-3">
        <input
          type="text"
          placeholder="Search projects or people..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-cream-100 border-2 border-cream-400 text-brown-800 placeholder:text-cream-500 focus:outline-none focus:border-orange-500 transition-colors"
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Segmented label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
          <Segmented label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          <BadgePicker value={badge} onChange={setBadge} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="loader" />
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-cream-100 border-2 border-cream-400 p-8 text-center">
          {isFiltered ? (
            <>
              <p className="text-brown-800">No projects match these filters.</p>
              <p className="text-cream-600 text-sm mt-1">Try a different search or loosen the filters.</p>
            </>
          ) : (
            <>
              <p className="text-brown-800">No projects to discover yet.</p>
              <p className="text-cream-600 text-sm mt-1">
                Check back later as more and more projects get built!
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} basePath={basePath} />
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
