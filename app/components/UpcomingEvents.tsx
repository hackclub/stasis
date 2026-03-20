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

const HUDDLE_URL = 'https://app.slack.com/huddle/T0266FRGM/C09HSQM550A';

function isHappeningNow(dateStr: string): boolean {
  return new Date(dateStr).getTime() - Date.now() <= 0;
}

function buildGoogleCalendarUrl(event: Event): string {
  const start = new Date(event.dateTime);
  const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1 hour
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.name,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: event.description,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

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
    <>
      <div className="bg-cream-100 border-2 border-cream-400 p-4 max-h-[400px] flex flex-col">
        <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4 flex-shrink-0">Upcoming Events</h2>
        <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
          {events.map((event) => {
            const { label, urgent } = formatRelativeFuture(event.dateTime);

            return (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={`block w-full text-left group border p-3 transition-colors cursor-pointer ${
                  urgent
                    ? 'border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10'
                    : 'border-cream-400 hover:bg-cream-200/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <p className="text-brown-800 text-base truncate group-hover:text-orange-500 transition-colors">
                      {event.name}
                    </p>
                    {isHappeningNow(event.dateTime) && (
                      <a
                        href={HUDDLE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs flex-shrink-0 px-2 py-0.5 bg-orange-500 text-white hover:bg-orange-400 transition-colors"
                      >
                        Join Event
                      </a>
                    )}
                  </div>
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
              </button>
            );
          })}
        </div>
      </div>

      {selectedEvent && (
        <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </>
  );
}

function EventModal({ event, onClose }: { event: Event; onClose: () => void }) {
  const { label, urgent } = formatRelativeFuture(event.dateTime);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" />
      <div
        className="relative bg-cream-100 border-2 border-cream-400 p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-cream-600 hover:text-brown-800 transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3 className="text-brown-800 text-lg font-medium mb-3 pr-8">{event.name}</h3>

        <div className="flex items-center gap-2 mb-4">
          <p className="text-cream-600 text-sm">{formatDateTime(event.dateTime)}</p>
          <span className={`text-xs flex-shrink-0 px-2 py-0.5 border ${
            urgent
              ? 'bg-orange-500/10 border-orange-500 text-orange-500 font-medium'
              : 'bg-cream-200 border-cream-400 text-brown-800'
          }`}>
            {label}
          </span>
        </div>

        <p className="text-brown-800 text-sm whitespace-pre-wrap mb-4">{event.description}</p>

        {!isHappeningNow(event.dateTime) && (
          <a
            href={buildGoogleCalendarUrl(event)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 text-sm uppercase hover:text-orange-400 transition-colors inline-block mb-4"
          >
            Add to Google Calendar &rarr;
          </a>
        )}

        {isHappeningNow(event.dateTime) && (
          <a
            href={HUDDLE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center bg-orange-500 text-white text-sm py-2 px-4 hover:bg-orange-400 transition-colors mb-4"
          >
            Join Event
          </a>
        )}

        <div className="border-t border-cream-400 pt-3 mt-2">
          <p className="text-cream-600 text-xs">
            This event takes place in the{' '}
            <a
              href="https://hackclub.enterprise.slack.com/archives/C09HSQM550A"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-500 underline hover:no-underline hover:text-white hover:bg-orange-500"
            >
              #stasis
            </a>
            {' '}channel in the Hack Club Slack.
          </p>
        </div>
      </div>
    </div>
  );
}
