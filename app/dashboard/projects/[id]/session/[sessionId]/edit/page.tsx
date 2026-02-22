'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
import Link from 'next/link';
import { SessionForm, type SessionCategory, type MediaItem, type SessionFormData } from '@/app/components/sessions/SessionForm';

interface Project {
  id: string
  title: string
}

interface WorkSession {
  id: string
  title: string
  hoursClaimed: number
  content: string | null
  categories: SessionCategory[]
  media: { id: string; type: "IMAGE" | "VIDEO"; url: string }[]
  timelapses?: { timelapseId: string }[]
}

export default function EditSessionPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const { id: projectId, sessionId } = use(params);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [workSession, setWorkSession] = useState<WorkSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [initialData, setInitialData] = useState<SessionFormData | undefined>(undefined);

  useEffect(() => {
    async function fetchData() {
      try {
        const [projectRes, sessionRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/sessions/${sessionId}`)
        ]);
        
        if (projectRes.ok) {
          const projectData = await projectRes.json();
          setProject(projectData);
        } else if (projectRes.status === 404) {
          router.push('/dashboard');
          return;
        }
        
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          setWorkSession(sessionData);
          
          const totalHours = sessionData.hoursClaimed;
          const hours = Math.floor(totalHours);
          const minutes = Math.round((totalHours % 1) * 60 / 15) * 15;
          
          setInitialData({
            title: sessionData.title || '',
            hoursValue: hours,
            minutesValue: minutes,
            content: sessionData.content || '',
            categories: sessionData.categories,
            media: sessionData.media.map((m: { id: string; type: "IMAGE" | "VIDEO"; url: string }) => ({
              id: m.id,
              type: m.type,
              url: m.url
            })) as MediaItem[],
            selectedTimelapseIds: sessionData.timelapses?.map((t: { timelapseId: string }) => t.timelapseId) ?? [],
          });
        } else if (sessionRes.status === 404) {
          router.push('/dashboard');
          return;
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchData();
    } else if (!isPending) {
      router.push('/dashboard');
    }
  }, [session, isPending, projectId, sessionId, router]);

  const handleSubmit = async (data: { title: string; hoursClaimed: number; content: string; categories: SessionCategory[]; media: { type: "IMAGE" | "VIDEO"; url: string }[]; timelapseIds?: string[] }) => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        router.push(`/dashboard/projects/${projectId}`);
      } else {
        const responseData = await res.json();
        setError(responseData.error || 'Failed to update session');
      }
    } catch (err) {
      console.error('Failed to update session:', err);
      setError('Failed to update session');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push(`/dashboard/projects/${projectId}`);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete session');
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
      setError('Failed to delete session');
    } finally {
      setDeleting(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-100 font-mono">
        <p className="text-brown-800">Loading...</p>
      </div>
    );
  }

  if (!project || !workSession || !initialData) {
    return null;
  }

  return (
    <>
      <div className="min-h-screen bg-cream-100 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-400">
          <Link href={`/dashboard/projects/${projectId}`} className="text-brown-800 hover:text-orange-500 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Project
          </Link>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-orange-500 text-2xl uppercase tracking-wide">Edit Journal Entry</h1>
            <p className="text-brown-800 text-sm mt-1">Project: {project.title}</p>
          </div>

          <SessionForm
            initialData={initialData}
            onSubmit={handleSubmit}
            submitLabel="Save Changes"
            submitting={submitting}
            error={error}
            setError={setError}
          >
            {/* Delete Section */}
            <div className="mt-8 pt-6 border-t border-cream-400">
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-500 hover:text-red-400 text-sm uppercase transition-colors cursor-pointer"
                >
                  Delete this entry...
                </button>
              ) : (
                <div className="bg-red-600/10 border border-red-600/50 p-4">
                  <p className="text-red-500 text-sm mb-3">Are you sure you want to delete this journal entry? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="bg-red-600 hover:bg-red-500 disabled:bg-cream-400 text-white px-4 py-2 text-sm uppercase cursor-pointer transition-colors"
                    >
                      {deleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="bg-cream-200 hover:bg-cream-300 text-brown-800 px-4 py-2 text-sm uppercase cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SessionForm>
        </div>
      </div>
      <NoiseOverlay />
    </>
  );
}
