'use client';

import { useState, useEffect } from 'react';

interface Event {
  id: string;
  name: string;
  description: string;
  dateTime: string;
  linkUrl: string | null;
  linkText: string | null;
}

function formatRelativeFuture(dateStr: string): { label: string; urgent: boolean } {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return { label: 'Happening now', urgent: true };

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return { label: `In ${diffMins}m`, urgent: true };
  if (diffHours < 24) return { label: `In ${diffHours}h`, urgent: true };
  if (diffDays < 7) return { label: `In ${diffDays}d`, urgent: false };
  return { label: date.toLocaleDateString(), urgent: false };
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function UpcomingEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch('/api/events/upcoming');
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events);
        }
      } catch (error) {
        console.error('Failed to fetch upcoming events:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchEvents();
  }, []);

  if (loading) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-4">
        <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4">Upcoming Events</h2>
        <div className="flex items-center justify-center py-4"><div className="loader" /></div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-cream-100 border-2 border-cream-400 p-4">
        <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4">Upcoming Events</h2>
        <p className="text-cream-600 text-sm">No upcoming events.</p>
      </div>
    );
  }

  return (
    <div className="bg-cream-100 border-2 border-cream-400 p-4 max-h-[400px] flex flex-col">
      <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4 flex-shrink-0">Upcoming Events</h2>
      <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
        {events.map((event) => {
          const { label, urgent } = formatRelativeFuture(event.dateTime);
          const Wrapper = event.linkUrl ? 'a' : 'div';
          const wrapperProps = event.linkUrl
            ? { href: event.linkUrl, target: '_blank' as const, rel: 'noopener noreferrer' }
            : {};

          return (
            <Wrapper
              key={event.id}
              {...wrapperProps}
              className={`block group border p-3 transition-colors ${
                urgent
                  ? 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10'
                  : 'border-cream-400 hover:bg-cream-200/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <p className="text-brown-800 text-base truncate group-hover:text-orange-500 transition-colors">
                  {event.name}
                </p>
                <span className={`text-xs flex-shrink-0 px-2 py-0.5 border ${
                  urgent
                    ? 'bg-orange-500/10 border-orange-500 text-orange-500 font-medium'
                    : 'bg-cream-200 border-cream-400 text-brown-800'
                }`}>
                  {label}
                </span>
              </div>
              <p className="text-cream-600 text-xs">{formatDateTime(event.dateTime)}</p>
              <p className="text-cream-600 text-xs truncate mt-1">
                {event.description.length > 100
                  ? event.description.slice(0, 100) + '...'
                  : event.description}
              </p>
              {event.linkUrl && (
                <span className="text-orange-500 text-xs uppercase mt-1.5 inline-block group-hover:text-orange-400 transition-colors">
                  {event.linkText || 'Learn more'} &rarr;
                </span>
              )}
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}
