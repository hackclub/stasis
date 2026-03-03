'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';

import Link from 'next/link';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums";
import { STARTER_PROJECTS } from "@/lib/starter-projects";
import { AVAILABLE_BADGES, MAX_BADGES_PER_PROJECT, getBadgeImage } from "@/lib/badges";
import { AVAILABLE_TAGS } from "@/lib/tags";
import { TIERS } from "@/lib/tiers";

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
    starterProjectId: string | null;
    githubRepo: string | null;
    tier: number | null;
    designStatus: string;
}

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
    const [starterProjectId, setStarterProjectId] = useState('');
    const [githubRepo, setGithubRepo] = useState('');
    const [selectedTier, setSelectedTier] = useState<number | null>(null);

    const [badges, setBadges] = useState<ProjectBadge[]>([]);
    const [loadingBadges, setLoadingBadges] = useState(false);
    const [claimingBadge, setClaimingBadge] = useState<BadgeType | null>(null);
    const [badgeError, setBadgeError] = useState<string | null>(null);
    const [allClaimedBadges, setAllClaimedBadges] = useState<BadgeType[]>([]);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    const fetchBadges = useCallback(async () => {
        if (!projectId) return;
        setLoadingBadges(true);
        try {
            const [badgesRes, claimedRes] = await Promise.all([
                fetch(`/api/badges?projectId=${projectId}`),
                fetch('/api/badges?allClaimed=true'),
            ]);
            if (badgesRes.ok) {
                const data = await badgesRes.json();
                setBadges(data);
            }
            if (claimedRes.ok) {
                const claimed = await claimedRes.json();
                setAllClaimedBadges(claimed);
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
                    setStarterProjectId(data.starterProjectId || '');
                    setGithubRepo(data.githubRepo || '');
                    setSelectedTier(data.tier ?? null);
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
        if (badges.length >= MAX_BADGES_PER_PROJECT) return;
        if (badges.some(b => b.badge === badge)) return;

        setBadgeError(null);
        setClaimingBadge(badge);
        try {
            const res = await fetch('/api/badges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ badge, projectId }),
            });
            if (res.ok) {
                fetchBadges();
            } else {
                const result = await res.json();
                if (result.error?.includes('already in use')) {
                    setBadgeError("This badge is already claimed on another project. Please choose a different one.");
                } else {
                    setBadgeError(result.error || 'Failed to claim badge');
                }
            }
        } catch (error) {
            console.error('Failed to claim badge:', error);
            setBadgeError('Failed to claim badge');
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
        if (isStarter && !starterProjectId) return;

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
                    starterProjectId: isStarter ? starterProjectId : null,
                    githubRepo: githubRepo.trim() || null,
                    tier: selectedTier,
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
            <div className="min-h-screen flex items-center justify-center bg-cream-100 font-mono">
                <p className="text-brown-800">Loading...</p>
            </div>
        );
    }

    if (!project) {
        return null;
    }

    const claimedBadgeTypes = badges.map(b => b.badge);
    const canDelete = deleteConfirmText.toLowerCase() === project.title.toLowerCase();

    return (
        <div className="max-w-2xl mx-auto">
            {/* Breadcrumb */}
            <div className="mb-6">
                <Link href={`/dashboard/projects/${project.id}`} className="text-brown-800 hover:text-orange-400 transition-colors flex items-center gap-2 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    Back to Project
                </Link>
            </div>

            {/* Hero */}
            <div className="relative mb-10">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-500 via-orange-400 to-transparent" />
                <div className="pl-4">
                    <p className="text-cream-600 text-xs uppercase tracking-widest mb-1">Editing</p>
                    <h1 className="text-orange-500 text-3xl uppercase tracking-wide font-medium">{project.title}</h1>
                    {project.description && (
                        <p className="text-brown-800 mt-2 line-clamp-2">{project.description}</p>
                    )}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-cream-200 border-2 border-cream-400 p-6 space-y-6">
                    <div>
                        <label className="block text-brown-800 text-sm uppercase mb-2">
                            Title
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors"
                            placeholder="My Awesome Project"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-brown-800 text-sm uppercase mb-2">
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors resize-none h-24"
                            placeholder="What are you building?"
                        />
                    </div>

                    <div>
                        <label className="block text-brown-800 text-sm uppercase mb-2">
                            GitHub Repo <span className="text-orange-400">(required for submission)</span>
                        </label>
                        <input
                            type="text"
                            value={githubRepo}
                            onChange={(e) => setGithubRepo(e.target.value)}
                            className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors"
                            placeholder="github.com/username/repo"
                        />
                    </div>

                    <div>
                        <label className="block text-brown-800 text-sm uppercase mb-2">
                            Tags
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {AVAILABLE_TAGS.map((tag) => (
                                <button
                                    key={tag.value}
                                    type="button"
                                    onClick={() => handleTagToggle(tag.value)}
                                    className={`px-3 py-1.5 text-sm uppercase transition-colors cursor-pointer ${selectedTags.includes(tag.value)
                                            ? 'bg-orange-500 text-white font-medium'
                                            : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                                        }`}
                                >
                                    {tag.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-brown-800 text-sm uppercase mb-2">
                            Complexity Level
                            {project.designStatus === 'approved' && (
                                <span className="ml-2 text-cream-500 normal-case text-xs">(locked — set by reviewer)</span>
                            )}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {TIERS.map((tier) => (
                                <button
                                    key={tier.id}
                                    type="button"
                                    onClick={() => project.designStatus !== 'approved' && setSelectedTier(selectedTier === tier.id ? null : tier.id)}
                                    disabled={project.designStatus === 'approved'}
                                    className={`px-3 py-2 text-sm text-left border ${
                                        selectedTier === tier.id
                                            ? project.designStatus === 'approved'
                                                ? 'bg-green-600/20 border-green-600 text-green-700 cursor-default'
                                                : 'bg-orange-500 text-white border-orange-400 cursor-pointer'
                                            : project.designStatus === 'approved'
                                                ? 'bg-cream-200 text-cream-400 border-cream-300 cursor-default'
                                                : 'bg-cream-300 text-brown-800 hover:bg-cream-400 border-cream-400 cursor-pointer transition-colors'
                                    }`}
                                >
                                    <span className="uppercase font-medium">{tier.name}</span>
                                    <span className="block text-xs mt-0.5 opacity-80">
                                        {tier.bits} bits · {tier.minHours}{tier.maxHours === Infinity ? '+' : `–${tier.maxHours}`}h
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-brown-800 text-sm uppercase mb-2">
                            Project Type
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setIsStarter(false)}
                                className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${!isStarter
                                        ? 'bg-orange-500 text-white font-medium'
                                        : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                                    }`}
                            >
                                Custom
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsStarter(true)}
                                className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${isStarter
                                        ? 'bg-orange-500 text-white font-medium'
                                        : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                                    }`}
                            >
                                Starter
                            </button>
                        </div>
                    </div>

                    {isStarter && (
                        <div>
                            <label className="block text-brown-800 text-xs uppercase mb-2 mt-4">
                                Which Starter Project?
                            </label>
                            <select
                                value={starterProjectId}
                                onChange={(e) => setStarterProjectId(e.target.value)}
                                className="w-full bg-white border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors"
                                required
                            >
                                <option value="">Select a starter project...</option>
                                {STARTER_PROJECTS.map((project) => (
                                    <option key={project.id} value={project.id}>
                                        {project.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Badges section */}
                <div className="bg-cream-200 border-2 border-cream-400 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-brown-800 text-lg uppercase">
                            Skill Badges ({badges.length}/{MAX_BADGES_PER_PROJECT})
                        </h2>
                        {loadingBadges && <span className="text-brown-800 text-xs">Loading...</span>}
                    </div>

                    {badgeError && (
                        <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 text-sm mb-4">
                            {badgeError}
                        </div>
                    )}

                    {/* Claimed badges */}
                    {badges.length > 0 && (
                        <div className="mb-4 space-y-2">
                            <p className="text-brown-800 text-xs uppercase">Claimed</p>
                            <div className="flex flex-wrap gap-2">
                                {badges.map((badge) => {
                                    const badgeInfo = AVAILABLE_BADGES.find(b => b.value === badge.badge);
                                    return (
                                        <div
                                            key={badge.id}
                                            className={`flex items-center gap-2 px-3 py-1.5 text-sm ${badge.grantedAt
                                                    ? 'bg-green-600/40 border border-green-500 text-green-600'
                                                    : 'bg-orange-500/30 border border-orange-400 text-orange-500'
                                                }`}
                                        >
                                            <img src={getBadgeImage(badge.badge)} alt="" className={`w-8 h-8 object-contain ${!badge.grantedAt ? 'grayscale opacity-60' : ''}`} />
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
                    {badges.length < MAX_BADGES_PER_PROJECT && (
                        <div>
                            <p className="text-brown-800 text-xs uppercase mb-2">Available to claim</p>
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                {AVAILABLE_BADGES.filter(b => !claimedBadgeTypes.includes(b.value)).map((badge) => {
                                    const isClaimedElsewhere = allClaimedBadges.includes(badge.value)
                                    return (
                                        <button
                                            key={badge.value}
                                            type="button"
                                            onClick={() => !isClaimedElsewhere && handleClaimBadge(badge.value)}
                                            disabled={claimingBadge === badge.value || isClaimedElsewhere}
                                            title={isClaimedElsewhere ? "Already claimed on another project" : undefined}
                                            className={`text-left px-3 py-2 border text-sm transition-colors ${
                                                isClaimedElsewhere
                                                    ? 'bg-cream-200 border-cream-300 text-cream-400 cursor-not-allowed line-through'
                                                    : 'bg-white border-cream-400 hover:border-orange-400 text-brown-800 cursor-pointer disabled:opacity-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <img src={getBadgeImage(badge.value)} alt="" className="w-8 h-8 object-contain" />
                                                <span>{badge.label}</span>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={!title.trim() || saving}
                    className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-cream-300 disabled:text-cream-500 disabled:cursor-not-allowed text-white font-medium py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </form>

            {/* Delete section */}
            <div className="mt-8 bg-cream-200 border-2 border-red-600/30 p-6">
                <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                    className="text-red-500 hover:text-red-400 text-sm uppercase transition-colors cursor-pointer"
                >
                    {showDeleteConfirm ? 'Cancel Delete' : 'Delete Project...'}
                </button>

                {showDeleteConfirm && (
                    <div className="mt-4 space-y-3">
                        <p className="text-brown-800 text-sm">
                            Type <span className="text-red-500 font-bold">{project.title}</span> to confirm deletion:
                        </p>
                        <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                            className="w-full bg-white border-2 border-red-600/50 text-brown-800 px-3 py-2 focus:border-red-500 focus:outline-none transition-colors"
                            placeholder="Type project name..."
                        />
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={!canDelete || deleting}
                            className="w-full bg-red-600 hover:bg-red-500 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
                        >
                            {deleting ? 'Deleting...' : 'Permanently Delete Project'}
                        </button>
                    </div>
                )}
            </div>
        </div>
  );
}
