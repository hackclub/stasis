'use client';

import { useState, useEffect, useCallback } from 'react';

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HT)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central Europe (CET)' },
  { value: 'Europe/Helsinki', label: 'Eastern Europe (EET)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

function getLocalTimezone(): string {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (COMMON_TIMEZONES.some((tz) => tz.value === local)) return local;
  return 'America/New_York';
}

/** Convert a datetime-local string + IANA timezone to a UTC ISO string */
function localToUTC(dateTimeLocal: string, timezone: string): string {
  // Build an ISO-ish string with no offset — then resolve it in the target tz
  const fakeDate = new Date(dateTimeLocal); // parsed as local
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(fakeDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  // The offset between the tz-formatted time and the input tells us the tz offset
  const tzDate = new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`);
  const offsetMs = tzDate.getTime() - fakeDate.getTime();
  // Subtract that offset to get true UTC
  return new Date(fakeDate.getTime() - offsetMs).toISOString();
}

/** Convert a UTC ISO string to a datetime-local string in a given timezone */
function utcToLocal(isoString: string, timezone: string): string {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

interface Event {
  id: string;
  name: string;
  description: string;
  dateTime: string;
  linkUrl: string | null;
  linkText: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDateTime, setFormDateTime] = useState('');
  const [formTimezone, setFormTimezone] = useState(getLocalTimezone);
  const [formLinkUrl, setFormLinkUrl] = useState('');
  const [formLinkText, setFormLinkText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/admin/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
      } else {
        setFetchError('Failed to load events.');
      }
    } catch {
      setFetchError('Network error — could not load events.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormDateTime('');
    setFormTimezone(getLocalTimezone());
    setFormLinkUrl('');
    setFormLinkText('');
    setEditingId(null);
    setFormError(null);
  };

  const startEditing = (event: Event) => {
    setEditingId(event.id);
    setFormName(event.name);
    setFormDescription(event.description);
    setFormDateTime(utcToLocal(event.dateTime, formTimezone));
    setFormLinkUrl(event.linkUrl ?? '');
    setFormLinkText(event.linkText ?? '');
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!formDescription.trim()) {
      setFormError('Description is required.');
      return;
    }
    if (!formDateTime) {
      setFormError('Date/time is required.');
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        name: formName.trim(),
        description: formDescription.trim(),
        dateTime: localToUTC(formDateTime, formTimezone),
        linkUrl: formLinkUrl.trim() || null,
        linkText: formLinkText.trim() || null,
      };

      const url = editingId ? `/api/admin/events/${editingId}` : '/api/admin/events';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        resetForm();
        fetchEvents();
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data.error === 'string' ? data.error.slice(0, 200) : null;
        setFormError(msg ?? 'Failed to save event.');
      }
    } catch {
      setFormError('Failed to save event.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this event? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/admin/events/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchEvents();
        if (editingId === id) resetForm();
      } else {
        alert('Failed to delete event.');
      }
    } catch {
      alert('Failed to delete event.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Events</h1>
        <p className="text-cream-50 text-sm mt-1">
          Manage upcoming events shown on the dashboard. {events.length} event{events.length !== 1 ? 's' : ''} total.
        </p>
      </div>

      {/* Create / Edit form */}
      <div className="bg-brown-800 border-2 border-cream-500/20 p-6">
        <h2 className="text-cream-50 text-lg uppercase tracking-wide mb-4">
          {editingId ? 'Edit Event' : 'Add Event'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-cream-50 text-xs uppercase block mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Event name"
                className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-cream-50 text-xs uppercase block mb-1">Date & Time</label>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={formDateTime}
                  onChange={(e) => setFormDateTime(e.target.value)}
                  className="flex-1 bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
                <select
                  value={formTimezone}
                  onChange={(e) => setFormTimezone(e.target.value)}
                  className="bg-brown-900 border border-cream-500/20 text-cream-50 px-2 py-2 text-sm focus:border-orange-500 focus:outline-none"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="text-cream-50 text-xs uppercase block mb-1">Description</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Event description"
              rows={3}
              className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-y"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-cream-50 text-xs uppercase block mb-1">Link URL <span className="normal-case text-cream-200">(optional)</span></label>
              <input
                type="text"
                value={formLinkUrl}
                onChange={(e) => setFormLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-cream-50 text-xs uppercase block mb-1">Link Text <span className="normal-case text-cream-200">(optional)</span></label>
              <input
                type="text"
                value={formLinkText}
                onChange={(e) => setFormLinkText(e.target.value)}
                placeholder="e.g. Register here"
                className="w-full bg-brown-900 border border-cream-500/20 text-cream-50 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
          {formError && <p className="text-red-600 text-sm">{formError}</p>}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="bg-orange-500 hover:bg-orange-400 text-white px-6 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Event'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-brown-800 hover:bg-cream-400 text-cream-50 px-6 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Events table */}
      <div className="bg-brown-800 border-2 border-cream-500/20 overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center">
            <div className="flex items-center justify-center"><div className="loader" /></div>
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center">
            <p className="text-red-600 text-sm">{fetchError}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-cream-50">No events yet. Add one above.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-cream-500/20">
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Name</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Date/Time</th>
                <th className="text-left text-cream-50 text-xs uppercase px-4 py-3">Link</th>
                <th className="text-right text-cream-50 text-xs uppercase px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-cream-500/10 last:border-b-0 hover:bg-brown-9000/5">
                  <td className="px-4 py-3">
                    <p className="text-cream-50 font-medium">{event.name}</p>
                    <p className="text-cream-200 text-xs truncate max-w-xs">{event.description}</p>
                  </td>
                  <td className="px-4 py-3 text-cream-50 whitespace-nowrap">
                    {new Date(event.dateTime).toLocaleString(undefined, { timeZoneName: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    {event.linkUrl ? (
                      <a
                        href={event.linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-orange-500 hover:text-orange-400 text-xs underline"
                      >
                        {event.linkText || event.linkUrl}
                      </a>
                    ) : (
                      <span className="text-cream-200 text-xs">—</span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEditing(event)}
                        className="text-orange-500 hover:text-orange-400 text-xs uppercase cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(event.id)}
                        className="text-red-600 hover:text-red-500 text-xs uppercase cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
