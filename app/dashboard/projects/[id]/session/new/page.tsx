'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SessionForm, type SessionCategory } from '@/app/components/sessions/SessionForm';

type ProjectStatus = "draft" | "in_review" | "approved" | "rejected" | "update_requested"

interface Project {
  id: string
  title: string
  githubRepo: string | null
  designStatus: ProjectStatus
  buildStatus: ProjectStatus
}

export default function NewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const projectRes = await fetch(`/api/projects/${projectId}`);

        if (projectRes.ok) {
          const data = await projectRes.json();
          setProject(data);
        } else if (projectRes.status === 404) {
          router.push('/dashboard');
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
  }, [session, isPending, projectId, router]);

  const handleSubmit = async (data: { title: string; hoursClaimed: number; content: string; categories: SessionCategory[]; media: { type: "IMAGE" | "VIDEO"; url: string }[]; timelapseIds?: string[] }) => {
    setSubmitting(true);
    setError(null);

    try {
      const stage = project?.designStatus === "approved" ? "BUILD" : "DESIGN";

      const res = await fetch(`/api/projects/${projectId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          stage,
        }),
      });

      if (res.ok) {
        router.push(`/dashboard/projects/${projectId}`);
      } else {
        const responseData = await res.json();
        setError(responseData.error || 'Failed to create session');
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      setError('Failed to create session');
    } finally {
      setSubmitting(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-brown-800">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href={`/dashboard/projects/${projectId}`} className="text-brown-800 hover:text-orange-500 transition-colors flex items-center gap-2 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back to Project
        </Link>
        <h1 className="text-orange-500 text-2xl uppercase tracking-wide">New Journal Entry</h1>
        <p className="text-brown-800 text-sm mt-1">Project: {project.title}</p>
        <div className="mt-3">
          <span className={`px-3 py-1 text-sm uppercase ${
            project.designStatus === "approved"
              ? 'bg-blue-600/30 border border-blue-600 text-blue-600'
              : 'bg-yellow-500/30 border border-yellow-500 text-yellow-500'
          }`}>
            {project.designStatus === "approved" ? 'Build Stage Session' : 'Design Stage Session'}
          </span>
        </div>
      </div>

      <SessionForm
        onSubmit={handleSubmit}
        submitLabel="Save Journal Entry"
        submitting={submitting}
        error={error}
        setError={setError}
        autosaveKey={`session-new-${projectId}`}
      />
    </div>
  );
}
