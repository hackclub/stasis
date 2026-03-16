'use client';

import { useState, useEffect, useCallback } from 'react';

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
    setFormLinkUrl('');
    setFormLinkText('');
    setEditingId(null);
    setFormError(null);
  };

  const startEditing = (event: Event) => {
    setEditingId(event.id);
    setFormName(event.name);
    setFormDescription(event.description);
    // Convert ISO string to datetime-local format
    const dt = new Date(event.dateTime);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setFormDateTime(local);
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
        dateTime: new Date(formDateTime).toISOString(),
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
        <p className="text-brown-800 text-sm mt-1">
          Manage upcoming events shown on the dashboard. {events.length} event{events.length !== 1 ? 's' : ''} total.
        </p>
      </div>

      {/* Create / Edit form */}
      <div className="bg-cream-100 border-2 border-cream-400 p-6">
        <h2 className="text-brown-800 text-lg uppercase tracking-wide mb-4">
          {editingId ? 'Edit Event' : 'Add Event'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-brown-800 text-xs uppercase block mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Event name"
                className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-brown-800 text-xs uppercase block mb-1">Date & Time</label>
              <input
                type="datetime-local"
                value={formDateTime}
                onChange={(e) => setFormDateTime(e.target.value)}
                className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-brown-800 text-xs uppercase block mb-1">Description</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Event description"
              rows={3}
              className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-y"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-brown-800 text-xs uppercase block mb-1">Link URL <span className="normal-case text-cream-600">(optional)</span></label>
              <input
                type="text"
                value={formLinkUrl}
                onChange={(e) => setFormLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-brown-800 text-xs uppercase block mb-1">Link Text <span className="normal-case text-cream-600">(optional)</span></label>
              <input
                type="text"
                value={formLinkText}
                onChange={(e) => setFormLinkText(e.target.value)}
                placeholder="e.g. Register here"
                className="w-full bg-cream-50 border border-cream-400 text-brown-800 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
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
                className="bg-cream-300 hover:bg-cream-400 text-brown-800 px-6 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Events table */}
      <div className="bg-cream-100 border-2 border-cream-400 overflow-x-auto">
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
            <p className="text-brown-800">No events yet. Add one above.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-cream-400">
                <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Name</th>
                <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Date/Time</th>
                <th className="text-left text-brown-800 text-xs uppercase px-4 py-3">Link</th>
                <th className="text-right text-brown-800 text-xs uppercase px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-cream-300 last:border-b-0 hover:bg-cream-200/50">
                  <td className="px-4 py-3">
                    <p className="text-brown-800 font-medium">{event.name}</p>
                    <p className="text-cream-600 text-xs truncate max-w-xs">{event.description}</p>
                  </td>
                  <td className="px-4 py-3 text-brown-800 whitespace-nowrap">
                    {new Date(event.dateTime).toLocaleString()}
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
                      <span className="text-cream-500 text-xs">—</span>
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
