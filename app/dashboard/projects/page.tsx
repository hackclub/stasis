'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';
import { NoiseOverlay } from '../../components/NoiseOverlay';
import { ProjectCard } from '../../components/projects/ProjectCard';
import { NewProjectCard } from '../../components/projects/NewProjectCard';
import { NewProjectModal } from '../../components/projects/NewProjectModal';
import { EditProjectModal } from '../../components/projects/EditProjectModal';
import { ProjectGridHoverCorners } from '../../components/starter-projects/ProjectGridHoverCorners';
import { ProjectTag } from "@/app/generated/prisma/enums"
import Link from 'next/link';

interface Project {
  id: string
  title: string
  description: string | null
  tags: ProjectTag[]
  totalHours: number
  isStarter: boolean
  createdAt: string
}

export default function ProjectsDashboard() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState<number | null>(null);
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchProjects();
    }
  }, [session, fetchProjects]);

  const handleCreateProject = async (data: {
    title: string
    description: string
    tags: ProjectTag[]
    isStarter: boolean
  }) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        setIsModalOpen(false);
        fetchProjects();
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleEditProject = async (id: string, data: {
    title: string
    description: string
    tags: ProjectTag[]
    isStarter: boolean
  }) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (res.ok) {
        setIsEditModalOpen(false);
        fetchProjects();
      }
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        setIsEditModalOpen(false);
        setSelectedProjectIndex(null);
        fetchProjects();
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-500">Loading...</p>
      </div>
    );
  }

  if (!session) {
    router.push('/dashboard');
    return null;
  }

  const selectedProject = selectedProjectIndex !== null ? projects[selectedProjectIndex] : null;

  return (
    <>
      <div className="min-h-screen bg-cream-950 font-mono relative">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href="/dashboard" className="text-cream-500 hover:text-brand-500 transition-colors">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </Link>
          <h1 className="text-brand-500 text-xl uppercase tracking-wider">
            My Projects
          </h1>
          <div className="w-6" />
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Main content area */}
          <div className="flex flex-col lg:flex-row gap-0.5 bg-cream-500">
            {/* Preview panel */}
            <div className="lg:w-80 bg-cream-900 p-6 relative min-h-[300px]">
              <p className="text-cream-500/20 absolute top-2 right-3 text-xs">PREVIEW</p>
              
              {selectedProject ? (
                <div className="space-y-4">
                  <h2 className="text-brand-500 text-3xl uppercase">
                    {selectedProject.title}
                  </h2>
                  <p className="text-cream-50 text-xl">
                    ~{selectedProject.totalHours.toFixed(1)} hours
                  </p>
                  {selectedProject.description && (
                    <p className="text-cream-500 text-sm">
                      {selectedProject.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedProject.tags.map((tag) => (
                      <span 
                        key={tag} 
                        className="text-xs bg-cream-850 text-cream-500 px-2 py-1 uppercase"
                      >
                        {tag.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                  {selectedProject.isStarter && (
                    <span className="inline-block text-xs bg-brand-500 text-brand-900 px-2 py-1 uppercase">
                      Starter Project
                    </span>
                  )}
                  <button
                    onClick={() => setIsEditModalOpen(true)}
                    className="w-full mt-4 bg-cream-850 hover:bg-cream-800 text-cream-100 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Edit Project
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-cream-500/50 text-lg">
                    Select a project
                  </p>
                </div>
              )}
            </div>

            {/* Project grid */}
            <div className="flex-1 bg-cream-900 relative">
              <p className="text-cream-500/20 absolute top-2 right-3 text-xs z-10">PROJECTS</p>
              
              <div 
                ref={setGridEl}
                className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-0.5 bg-cream-500 p-0.5 relative"
              >
                <ProjectGridHoverCorners gridEl={gridEl} selectedIndex={selectedProjectIndex} />
                
                <NewProjectCard onClick={() => setIsModalOpen(true)} />
                
                {projects.map((project, index) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    selected={selectedProjectIndex === index}
                    onClick={() => setSelectedProjectIndex(index)}
                  />
                ))}
              </div>

              {projects.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-cream-500">No projects yet. Create your first one!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <NewProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateProject}
      />

      <EditProjectModal
        isOpen={isEditModalOpen}
        project={selectedProject}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleEditProject}
        onDelete={handleDeleteProject}
      />

      <NoiseOverlay />
    </>
  );
}
