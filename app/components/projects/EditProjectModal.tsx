'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { STARTER_PROJECTS } from "@/lib/starter-projects"
import { AVAILABLE_BADGES, MAX_BADGES_PER_PROJECT } from "@/lib/badges"
import { AVAILABLE_TAGS } from "@/lib/tags"
import { TIERS } from "@/lib/tiers"

interface ProjectBadge {
  id: string
  badge: BadgeType
  claimedAt: string
  grantedAt: string | null
}

interface Project {
  id: string
  title: string
  description: string | null
  tags: ProjectTag[]
  isStarter: boolean
  starterProjectId: string | null
  githubRepo: string | null
  tier: number | null
}

interface Props {
  isOpen: boolean
  project: Project | null
  onClose: () => void
  onSubmit: (id: string, data: {
    title: string
    description: string
    tags: ProjectTag[]
    isStarter: boolean
    starterProjectId: string | null
    githubRepo: string
    tier: number | null
  }) => void
  onDelete?: (id: string) => void
}

export function EditProjectModal({ isOpen, project, onClose, onSubmit, onDelete }: Readonly<Props>) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTags, setSelectedTags] = useState<ProjectTag[]>([])
  const [isStarter, setIsStarter] = useState(false)
  const [starterProjectId, setStarterProjectId] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  
  const [badges, setBadges] = useState<ProjectBadge[]>([])
  const [loadingBadges, setLoadingBadges] = useState(false)
  const [claimingBadge, setClaimingBadge] = useState<BadgeType | null>(null)

  const fetchBadges = useCallback(async () => {
    if (!project) return
    setLoadingBadges(true)
    try {
      const res = await fetch(`/api/badges?projectId=${project.id}`)
      if (res.ok) {
        const data = await res.json()
        setBadges(data)
      }
    } catch (error) {
      console.error('Failed to fetch badges:', error)
    } finally {
      setLoadingBadges(false)
    }
  }, [project])

  useEffect(() => {
    if (project && isOpen) {
      setTitle(project.title)
      setDescription(project.description || '')
      setSelectedTags(project.tags)
      setIsStarter(project.isStarter)
      setStarterProjectId(project.starterProjectId || '')
      setGithubRepo(project.githubRepo || '')
      setSelectedTier(project.tier)
      setShowDeleteConfirm(false)
      setDeleteConfirmText('')
      fetchBadges()
    }
  }, [project, isOpen, fetchBadges])

  if (!isOpen || !project) return null

  const handleTagToggle = (tag: ProjectTag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const handleClaimBadge = async (badge: BadgeType) => {
    if (badges.length >= MAX_BADGES_PER_PROJECT) return
    if (badges.some(b => b.badge === badge)) return
    
    setClaimingBadge(badge)
    try {
      const res = await fetch('/api/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badge, projectId: project.id }),
      })
      if (res.ok) {
        fetchBadges()
      }
    } catch (error) {
      console.error('Failed to claim badge:', error)
    } finally {
      setClaimingBadge(null)
    }
  }

  const handleUnclaimBadge = async (badgeId: string, isGranted: boolean) => {
    if (isGranted) return
    
    try {
      const res = await fetch(`/api/badges/${badgeId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchBadges()
      }
    } catch (error) {
      console.error('Failed to unclaim badge:', error)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    if (isStarter && !starterProjectId) return
    
    onSubmit(project.id, {
      title: title.trim(),
      description: description.trim(),
      tags: selectedTags,
      isStarter,
      starterProjectId: isStarter ? starterProjectId : null,
      githubRepo: githubRepo.trim(),
      tier: selectedTier,
    })
  }

  const canDelete = deleteConfirmText.toLowerCase() === project.title.toLowerCase()

  const handleDelete = () => {
    if (canDelete && onDelete) {
      onDelete(project.id)
      onClose()
    }
  }

  const claimedBadgeTypes = badges.map(b => b.badge)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-[#3D3229]/80"
        onClick={onClose}
      />
      <div className="relative bg-cream-100 border-2 border-cream-400 max-w-2xl w-full mx-4 font-mono max-h-[90vh] overflow-y-auto">
        <div className="bg-orange-500 px-4 py-2 flex items-center justify-between sticky top-0 z-10">
          <h2 className="text-white text-lg uppercase tracking-wide">
            Edit Project
          </h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-cream-100 transition-colors cursor-pointer"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-brown-800 text-sm uppercase mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-cream-200 border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors"
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
              className="w-full bg-cream-200 border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors resize-none h-24"
              placeholder="What are you building?"
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
                  className={`px-3 py-1.5 text-sm uppercase transition-colors cursor-pointer ${
                    selectedTags.includes(tag.value)
                      ? 'bg-orange-500 text-white'
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
              GitHub Repository
            </label>
            <input
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              className="w-full bg-cream-200 border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors"
              placeholder="github.com/user/repo"
            />
          </div>

          <div>
            <label className="block text-brown-800 text-sm uppercase mb-2">
              Complexity Level
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TIERS.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTier(selectedTier === tier.id ? null : tier.id)}
                  className={`px-3 py-2 text-sm text-left transition-colors cursor-pointer border ${
                    selectedTier === tier.id
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-cream-200 text-brown-800 hover:bg-cream-300 border-cream-400'
                  }`}
                >
                  <span className="uppercase font-medium">{tier.name}</span>
                  <span className="block text-xs mt-0.5 opacity-80">
                    {tier.bits}&nbsp;bits · {tier.minHours}{tier.maxHours === Infinity ? '+' : `–${tier.maxHours}`}h
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Badges section */}
          <div className="border-t border-cream-400 pt-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-brown-800 text-sm uppercase">
                Skill Badges ({badges.length}/{MAX_BADGES_PER_PROJECT})
              </label>
              {loadingBadges && <span className="text-cream-600 text-xs">Loading...</span>}
            </div>
            
            {/* Claimed badges */}
            {badges.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-cream-600 text-xs uppercase">Claimed</p>
                <div className="flex flex-wrap gap-2">
                  {badges.map((badge) => {
                    const badgeInfo = AVAILABLE_BADGES.find(b => b.value === badge.badge)
                    return (
                      <div 
                        key={badge.id}
                        className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
                          badge.grantedAt 
                            ? 'bg-green-600/20 border border-green-600 text-green-500' 
                            : 'bg-orange-500/20 border border-orange-500 text-orange-500'
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
                    )
                  })}
                </div>
              </div>
            )}

            {/* Available badges */}
            {badges.length < MAX_BADGES_PER_PROJECT && (
              <div>
                <p className="text-cream-600 text-xs uppercase mb-2">Available to claim</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {AVAILABLE_BADGES.filter(b => !claimedBadgeTypes.includes(b.value)).map((badge) => (
                    <button
                      key={badge.value}
                      type="button"
                      onClick={() => handleClaimBadge(badge.value)}
                      disabled={claimingBadge === badge.value}
                      className="text-left px-3 py-2 bg-cream-200 border border-cream-400 hover:border-orange-500 text-brown-800 hover:text-brown-800 transition-colors cursor-pointer disabled:opacity-50 text-sm"
                    >
                      {badge.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-brown-800 text-sm uppercase mb-2">
              Project Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsStarter(false)}
                className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                  !isStarter
                    ? 'bg-orange-500 text-white'
                    : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                }`}
              >
                Custom
              </button>
              <button
                type="button"
                onClick={() => setIsStarter(true)}
                className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                  isStarter
                    ? 'bg-orange-500 text-white'
                    : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                }`}
              >
                Starter
              </button>
            </div>
          </div>

          {isStarter && (
            <div>
              <label className="block text-brown-800 text-sm uppercase mb-2">
                Which Starter Project?
              </label>
              <select
                value={starterProjectId}
                onChange={(e) => setStarterProjectId(e.target.value)}
                className="w-full bg-cream-200 border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors"
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

          <button
            type="submit"
            disabled={!title.trim() || (isStarter && !starterProjectId)}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
          >
            Save Changes
          </button>

          {onDelete && (
            <div className="border-t border-cream-400 pt-6 mt-2">
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
                    className="w-full bg-cream-200 border-2 border-red-600/50 text-brown-800 px-3 py-2 focus:border-red-500 focus:outline-none transition-colors"
                    placeholder="Type project name..."
                  />
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={!canDelete}
                    className="w-full bg-red-600 hover:bg-red-500 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Permanently Delete Project
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
