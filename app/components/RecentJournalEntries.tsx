'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface RecentSession {
  id: string;
  hoursClaimed: number;
  hoursApproved: number | null;
  content: string | null;
  categories: string[];
  createdAt: string;
  project: {
    id: string;
    title: string;
  };
  media: {
    id: string;
    url: string;
    type: string;
  }[];
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
    .replace(/\[.*?\]\(.*?\)/g, '') // Remove links
    .replace(/[#*_~`]/g, '') // Remove formatting chars
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function RecentJournalEntries() {
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch('/api/sessions/recent');
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
        }
      } catch (error) {
        console.error('Failed to fetch recent sessions:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, []);

  if (loading) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-4">
        <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4">Recent Journal Entries</h2>
        <p className="text-cream-600 text-sm">Loading...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-4">
        <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4">Recent Journal Entries</h2>
        <p className="text-cream-600 text-sm">No journal entries yet. Log your first work session!</p>
      </div>
    );
  }

  return (
    <div className="bg-cream-100 border-2 border-cream-400 p-4">
      <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4">Recent Journal Entries</h2>
      <div className="space-y-3">
        {sessions.map((session) => (
          <Link
            key={session.id}
            href={`/dashboard/projects/${session.project.id}`}
            className="block group"
          >
            <div className="flex gap-3 p-2 -mx-2 hover:bg-cream-200/50 transition-colors">
              {session.media[0] && (
                <div className="w-12 h-12 flex-shrink-0 border border-cream-400 overflow-hidden">
                  <Image
                    src={session.media[0].url}
                    alt=""
                    width={48}
                    height={48}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-brown-800 text-base truncate group-hover:text-orange-500 transition-colors">
                    {session.project.title}
                  </p>
                  <span className="text-cream-500 text-xs flex-shrink-0">
                    {formatRelativeTime(session.createdAt)}
                  </span>
                </div>
                <p className="text-cream-600 text-xs truncate mt-0.5">
                  {session.content
                    ? (() => {
                        const cleaned = stripMarkdown(session.content);
                        return cleaned.length > 0
                          ? cleaned.slice(0, 80) + (cleaned.length > 80 ? '...' : '')
                          : `${session.hoursClaimed}h logged`;
                      })()
                    : `${session.hoursClaimed}h logged`}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs ${session.hoursApproved !== null ? 'text-orange-500' : 'text-cream-500'}`}>
                    {session.hoursApproved !== null ? `${session.hoursApproved}h approved` : `${session.hoursClaimed}h pending`}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
