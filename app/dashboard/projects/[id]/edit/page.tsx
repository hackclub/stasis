'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
import Link from 'next/link';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums";

interface ProjectBadge {
  id: string;
  badge: BadgeType;
  claimedAt: string;
  grantedAt: string | null;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  tags: ProjectTag[];
  isStarter: boolean;
  githubRepo: string | null;
}

const AVAILABLE_TAGS: { value: ProjectTag; label: string }[] = [
  { value: "PCB", label: "PCB" },
  { value: "ROBOT", label: "Robot" },
  { value: "CAD", label: "CAD" },
  { value: "ARDUINO", label: "Arduino" },
  { value: "RASPBERRY_PI", label: "Raspberry Pi" },
];

const AVAILABLE_BADGES: { value: BadgeType; label: string }[] = [
  { value: "I2C", label: "I2C" },
  { value: "SPI", label: "SPI" },
  { value: "WIFI", label: "WiFi" },
  { value: "BLUETOOTH", label: "Bluetooth" },
  { value: "OTHER_RF", label: "Other RF (LoRa, etc.)" },
  { value: "ANALOG_SENSORS", label: "Analog Sensors" },
  { value: "DIGITAL_SENSORS", label: "Digital Sensors" },
  { value: "CAD", label: "CAD" },
  { value: "DISPLAYS", label: "Displays" },
  { value: "MOTORS", label: "Motors" },
  { value: "CAMERAS", label: "Cameras" },
  { value: "METAL_MACHINING", label: "Metal/Machining" },
  { value: "WOOD_FASTENERS", label: "Wood & Fasteners" },
  { value: "MACHINE_LEARNING", label: "Machine Learning" },
  { value: "MCU_INTEGRATION", label: "MCU Integration" },
  { value: "FOUR_LAYER_PCB", label: "4-Layer PCB" },
  { value: "SOLDERING", label: "Soldering" },
];

const MAX_BADGES = 3;

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<ProjectTag[]>([]);
  const [isStarter, setIsStarter] = useState(false);
  const [githubRepo, setGithubRepo] = useState('');
  
  const [badges, setBadges] = useState<ProjectBadge[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);
  const [claimingBadge, setClaimingBadge] = useState<BadgeType | null>(null);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchBadges = useCallback(async () => {
    if (!projectId) return;
    setLoadingBadges(true);
    try {
      const res = await fetch(`/api/badges?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setBadges(data);
      }
    } catch (error) {
      console.error('Failed to fetch badges:', error);
    } finally {
      setLoadingBadges(false);
    }
  }, [projectId]);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
          setTitle(data.title);
          setDescription(data.description || '');
          setSelectedTags(data.tags);
          setIsStarter(data.isStarter);
          setGithubRepo(data.githubRepo || '');
        } else if (res.status === 404) {
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchProject();
      fetchBadges();
    } else if (!isPending) {
      router.push('/dashboard');
    }
  }, [session, isPending, projectId, router, fetchBadges]);

  const handleTagToggle = (tag: ProjectTag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleClaimBadge = async (badge: BadgeType) => {
    if (badges.length >= MAX_BADGES) return;
    if (badges.some(b => b.badge === badge)) return;
    
    setClaimingBadge(badge);
    try {
      const res = await fetch('/api/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge, projectId }),
      });
      if (res.ok) {
        fetchBadges();
      }
    } catch (error) {
      console.error('Failed to claim badge:', error);
    } finally {
      setClaimingBadge(null);
    }
  };

  const handleUnclaimBadge = async (badgeId: string, isGranted: boolean) => {
    if (isGranted) return;
    
    try {
      const res = await fetch(`/api/badges/${badgeId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchBadges();
      }
    } catch (error) {
      console.error('Failed to unclaim badge:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !project) return;
    
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          tags: selectedTags,
          isStarter,
          githubRepo: githubRepo.trim(),
        }),
      });
      
      if (res.ok) {
        router.push(`/dashboard/projects/${project.id}`);
      }
    } catch (error) {
      console.error('Failed to update project:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!project || deleteConfirmText.toLowerCase() !== project.title.toLowerCase()) return;
    
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setDeleting(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-500">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  const claimedBadgeTypes = badges.map(b => b.badge);
  const canDelete = deleteConfirmText.toLowerCase() === project.title.toLowerCase();

  return (
    <>
      <div className="min-h-screen bg-cream-950 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href={`/dashboard/projects/${project.id}`} className="text-cream-500 hover:text-brand-500 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Project
          </Link>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-brand-500 text-2xl uppercase tracking-wide mb-8">Edit Project</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-cream-900 border-2 border-cream-700 p-6 space-y-6">
              <div>
                <label className="block text-cream-500 text-sm uppercase mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-cream-950 border-2 border-cream-600 text-cream-100 px-3 py-2 focus:border-brand-500 focus:outline-none transition-colors"
                  placeholder="My Awesome Project"
                  required
                />
              </div>

              <div>
                <label className="block text-cream-500 text-sm uppercase mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-cream-950 border-2 border-cream-600 text-cream-100 px-3 py-2 focus:border-brand-500 focus:outline-none transition-colors resize-none h-24"
                  placeholder="What are you building?"
                />
              </div>

              <div>
                <label className="block text-cream-500 text-sm uppercase mb-2">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TAGS.map((tag) => (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => handleTagToggle(tag.value)}
                      className={`px-3 py-1.5 text-sm uppercase transition-colors cursor-pointer ${
                        selectedTags.includes(tag.value)
                          ? 'bg-brand-500 text-brand-900'
                          : 'bg-cream-850 text-cream-500 hover:bg-cream-800'
                      }`}
                    >
                      {tag.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-cream-500 text-sm uppercase mb-2">
                  GitHub Repository
                </label>
                <input
                  type="text"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                  className="w-full bg-cream-950 border-2 border-cream-600 text-cream-100 px-3 py-2 focus:border-brand-500 focus:outline-none transition-colors"
                  placeholder="https://github.com/user/repo"
                />
              </div>

              <div>
                <label className="block text-cream-500 text-sm uppercase mb-2">
                  Project Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStarter(false)}
                    className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                      !isStarter
                        ? 'bg-brand-500 text-brand-900'
                        : 'bg-cream-850 text-cream-500 hover:bg-cream-800'
                    }`}
                  >
                    Custom
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsStarter(true)}
                    className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                      isStarter
                        ? 'bg-brand-500 text-brand-900'
                        : 'bg-cream-850 text-cream-500 hover:bg-cream-800'
                    }`}
                  >
                    Starter
                  </button>
                </div>
              </div>
            </div>

            {/* Badges section */}
            <div className="bg-cream-900 border-2 border-cream-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-cream-100 text-lg uppercase">
                  Skill Badges ({badges.length}/{MAX_BADGES})
                </h2>
                {loadingBadges && <span className="text-cream-600 text-xs">Loading...</span>}
              </div>
              
              {/* Claimed badges */}
              {badges.length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-cream-600 text-xs uppercase">Claimed</p>
                  <div className="flex flex-wrap gap-2">
                    {badges.map((badge) => {
                      const badgeInfo = AVAILABLE_BADGES.find(b => b.value === badge.badge);
                      return (
                        <div 
                          key={badge.id}
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                            badge.grantedAt 
                              ? 'bg-green-600/20 border border-green-600 text-green-500' 
                              : 'bg-brand-500/20 border border-brand-500 text-brand-500'
                          }`}
                        >
                          <span>{badgeInfo?.label || badge.badge}</span>
                          {badge.grantedAt ? (
                            <span className="text-xs opacity-70">✓ Granted</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUnclaimBadge(badge.id, !!badge.grantedAt)}
                              className="hover:text-red-500 transition-colors cursor-pointer"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available badges */}
              {badges.length < MAX_BADGES && (
                <div>
                  <p className="text-cream-600 text-xs uppercase mb-2">Available to claim</p>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {AVAILABLE_BADGES.filter(b => !claimedBadgeTypes.includes(b.value)).map((badge) => (
                      <button
                        key={badge.value}
                        type="button"
                        onClick={() => handleClaimBadge(badge.value)}
                        disabled={claimingBadge === badge.value}
                        className="text-left px-3 py-2 bg-cream-950 border border-cream-800 hover:border-brand-500 text-cream-500 hover:text-cream-100 transition-colors cursor-pointer disabled:opacity-50 text-sm"
                      >
                        {badge.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="w-full bg-brand-500 hover:bg-brand-400 disabled:bg-cream-600 disabled:cursor-not-allowed text-brand-900 py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>

          {/* Delete section */}
          <div className="mt-8 bg-cream-900 border-2 border-red-600/30 p-6">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              className="text-red-500 hover:text-red-400 text-sm uppercase transition-colors cursor-pointer"
            >
              {showDeleteConfirm ? 'Cancel Delete' : 'Delete Project...'}
            </button>
            
            {showDeleteConfirm && (
              <div className="mt-4 space-y-3">
                <p className="text-cream-500 text-sm">
                  Type <span className="text-red-500 font-bold">{project.title}</span> to confirm deletion:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full bg-cream-950 border-2 border-red-600/50 text-cream-100 px-3 py-2 focus:border-red-500 focus:outline-none transition-colors"
                  placeholder="Type project name..."
                />
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canDelete || deleting}
                  className="w-full bg-red-600 hover:bg-red-500 disabled:bg-cream-600 disabled:cursor-not-allowed text-white py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {deleting ? 'Deleting...' : 'Permanently Delete Project'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <NoiseOverlay />
    </>
  );
}
