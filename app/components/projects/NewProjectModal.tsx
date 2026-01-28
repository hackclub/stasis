'use client';

import { useState, useEffect } from 'react';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { STARTER_PROJECTS } from "@/lib/starter-projects"
import { AVAILABLE_BADGES, MAX_BADGES_PER_PROJECT } from "@/lib/badges"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    title: string
    description: string
    tags: ProjectTag[]
    badges: BadgeType[]
    isStarter: boolean
    starterProjectId: string | null
  }) => Promise<{ error?: string } | void>
  error?: string | null
}

const AVAILABLE_TAGS: { value: ProjectTag; label: string }[] = [
  { value: "PCB", label: "PCB" },
  { value: "ROBOT", label: "Robot" },
  { value: "CAD", label: "CAD" },
  { value: "ARDUINO", label: "Arduino" },
  { value: "RASPBERRY_PI", label: "Raspberry Pi" },
]

export function NewProjectModal({ isOpen, onClose, onSubmit, error }: Readonly<Props>) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTags, setSelectedTags] = useState<ProjectTag[]>([])
  const [selectedBadges, setSelectedBadges] = useState<BadgeType[]>([])
  const [isStarter, setIsStarter] = useState(false)
  const [starterProjectId, setStarterProjectId] = useState('')
  const [claimedBadges, setClaimedBadges] = useState<BadgeType[]>([])

  useEffect(() => {
    if (isOpen) {
      fetch('/api/badges?allClaimed=true')
        .then(res => res.ok ? res.json() : [])
        .then(setClaimedBadges)
        .catch(() => setClaimedBadges([]))
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleTagToggle = (tag: ProjectTag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const handleBadgeToggle = (badge: BadgeType) => {
    setSelectedBadges(prev => {
      if (prev.includes(badge)) {
        return prev.filter(b => b !== badge)
      }
      if (prev.length >= MAX_BADGES_PER_PROJECT) return prev
      return [...prev, badge]
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    if (selectedBadges.length === 0) return
    if (isStarter && !starterProjectId) return
    
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      tags: selectedTags,
      badges: selectedBadges,
      isStarter,
      starterProjectId: isStarter ? starterProjectId : null,
    })

    setTitle('')
    setDescription('')
    setSelectedTags([])
    setSelectedBadges([])
    setIsStarter(false)
    setStarterProjectId('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-cream-900/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-cream-100 border-2 border-cream-400 max-w-lg w-full mx-4 font-mono">
        <div className="bg-brand-500 px-4 py-2 flex items-center justify-between">
          <h2 className="text-white text-lg uppercase tracking-wide">
            New Project
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
          {error && (
            <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-cream-700 text-sm uppercase mb-2">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-cream-200 border-2 border-cream-400 text-cream-800 px-3 py-2 focus:border-brand-500 focus:outline-none transition-colors"
              placeholder="My Awesome Project"
              required
            />
          </div>

          <div>
            <label className="block text-cream-700 text-sm uppercase mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-cream-200 border-2 border-cream-400 text-cream-800 px-3 py-2 focus:border-brand-500 focus:outline-none transition-colors resize-none h-24"
              placeholder="What are you building?"
            />
          </div>

          <div>
            <label className="block text-cream-700 text-sm uppercase mb-2">
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
                      ? 'bg-brand-500 text-white'
                      : 'bg-cream-300 text-cream-700 hover:bg-cream-400'
                  }`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-cream-700 text-sm uppercase mb-2">
              Skill Badges <span className="text-cream-500">({selectedBadges.length}/{MAX_BADGES_PER_PROJECT})</span>
            </label>
            <p className="text-cream-600 text-xs mb-2">
              Select up to {MAX_BADGES_PER_PROJECT} badges for skills you&apos;ll demonstrate in this project.
            </p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {AVAILABLE_BADGES.map((badge) => {
                const isClaimed = claimedBadges.includes(badge.value)
                const isSelected = selectedBadges.includes(badge.value)
                const isDisabled = isClaimed || (!isSelected && selectedBadges.length >= MAX_BADGES_PER_PROJECT)
                return (
                  <button
                    key={badge.value}
                    type="button"
                    onClick={() => !isClaimed && handleBadgeToggle(badge.value)}
                    disabled={isDisabled}
                    title={isClaimed ? "Already claimed on another project" : undefined}
                    className={`px-3 py-1.5 text-sm uppercase transition-colors ${
                      isSelected
                        ? 'bg-brand-500 text-white cursor-pointer'
                        : isClaimed
                          ? 'bg-cream-200 text-cream-400 cursor-not-allowed line-through'
                          : selectedBadges.length >= MAX_BADGES_PER_PROJECT
                            ? 'bg-cream-300 text-cream-500 cursor-not-allowed'
                            : 'bg-cream-300 text-cream-700 hover:bg-cream-400 cursor-pointer'
                    }`}
                  >
                    {badge.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-cream-700 text-sm uppercase mb-2">
              Project Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsStarter(false)}
                className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                  !isStarter
                    ? 'bg-brand-500 text-white'
                    : 'bg-cream-300 text-cream-700 hover:bg-cream-400'
                }`}
              >
                Custom
              </button>
              <button
                type="button"
                onClick={() => setIsStarter(true)}
                className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                  isStarter
                    ? 'bg-brand-500 text-white'
                    : 'bg-cream-300 text-cream-700 hover:bg-cream-400'
                }`}
              >
                Starter
              </button>
            </div>
          </div>

          {isStarter && (
            <div>
              <label className="block text-cream-700 text-sm uppercase mb-2">
                Which Starter Project?
              </label>
              <select
                value={starterProjectId}
                onChange={(e) => setStarterProjectId(e.target.value)}
                className="w-full bg-cream-200 border-2 border-cream-400 text-cream-800 px-3 py-2 focus:border-brand-500 focus:outline-none transition-colors"
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
            disabled={!title.trim() || selectedBadges.length === 0 || (isStarter && !starterProjectId)}
            className="w-full bg-brand-500 hover:bg-brand-400 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
          >
            Create Project
          </button>
        </form>
      </div>
    </div>
  )
}
