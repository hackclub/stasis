'use client';

import { useState, useEffect } from 'react';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { STARTER_PROJECTS } from "@/lib/starter-projects"
import { AVAILABLE_BADGES, MAX_BADGES_PER_PROJECT } from "@/lib/badges"
import { TIERS } from "@/lib/tiers"

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
    tier: number | null
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

const STEPS = ['Details', 'Tags & Badges', 'Configuration'] as const
type Step = 0 | 1 | 2

export function NewProjectModal({ isOpen, onClose, onSubmit, error }: Readonly<Props>) {
  const [step, setStep] = useState<Step>(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTags, setSelectedTags] = useState<ProjectTag[]>([])
  const [selectedBadges, setSelectedBadges] = useState<BadgeType[]>([])
  const [isStarter, setIsStarter] = useState(false)
  const [starterProjectId, setStarterProjectId] = useState('')
  const [claimedBadges, setClaimedBadges] = useState<BadgeType[]>([])
  const [selectedTier, setSelectedTier] = useState<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetch('/api/badges?allClaimed=true')
        .then(res => res.ok ? res.json() : [])
        .then(setClaimedBadges)
        .catch(() => setClaimedBadges([]))
    } else {
      setStep(0)
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
      tier: selectedTier,
    })

    setTitle('')
    setDescription('')
    setSelectedTags([])
    setSelectedBadges([])
    setIsStarter(false)
    setStarterProjectId('')
    setSelectedTier(null)
    setStep(0)
  }

  const canProceedFromStep0 = title.trim().length > 0
  const canProceedFromStep1 = selectedBadges.length > 0
  const canSubmit = canProceedFromStep0 && canProceedFromStep1 && (!isStarter || starterProjectId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-[#3D3229]/80"
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

        {/* Step Tabs */}
        <div className="flex border-b-2 border-cream-400">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (i === 0) setStep(0)
                else if (i === 1 && canProceedFromStep0) setStep(1)
                else if (i === 2 && canProceedFromStep0 && canProceedFromStep1) setStep(2)
              }}
              className={`flex-1 px-3 py-2 text-xs uppercase tracking-wide transition-colors cursor-pointer ${
                step === i
                  ? 'bg-cream-200 text-brand-500 border-b-2 border-brand-500 -mb-[2px]'
                  : 'text-cream-600 hover:text-cream-800'
              }`}
            >
              <span className="mr-1">{i + 1}.</span>{label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Details */}
          {step === 0 && (
            <>
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

              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={!canProceedFromStep0}
                className="w-full bg-brand-500 hover:bg-brand-400 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
              >
                Next →
              </button>
            </>
          )}

          {/* Step 2: Tags & Badges */}
          {step === 1 && (
            <>
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

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex-1 bg-cream-300 hover:bg-cream-400 text-cream-700 py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!canProceedFromStep1}
                  className="flex-1 bg-brand-500 hover:bg-brand-400 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {/* Step 3: Configuration */}
          {step === 2 && (
            <>
              <div>
                <label className="block text-cream-700 text-sm uppercase mb-2">
                  Project Tier
                </label>
                <p className="text-cream-600 text-xs mb-2">
                  Select the complexity tier for this project.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TIERS.map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setSelectedTier(selectedTier === tier.id ? null : tier.id)}
                      className={`px-3 py-2 text-sm text-left transition-colors cursor-pointer border ${
                        selectedTier === tier.id
                          ? 'bg-brand-500 text-white border-brand-400'
                          : 'bg-cream-200 text-cream-700 hover:bg-cream-300 border-cream-400'
                      }`}
                    >
                      <span className="uppercase font-medium">{tier.name}</span>
                      <span className="block text-xs mt-0.5 opacity-80">
                        {tier.bits} bits · {tier.minHours}–{tier.maxHours}h
                      </span>
                    </button>
                  ))}
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

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bg-cream-300 hover:bg-cream-400 text-cream-700 py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-1 bg-brand-500 hover:bg-brand-400 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
