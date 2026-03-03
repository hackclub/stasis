'use client';

import { useState, useEffect } from 'react';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { STARTER_PROJECTS } from "@/lib/starter-projects"
import { AVAILABLE_BADGES, MAX_BADGES_PER_PROJECT, getBadgeImage } from "@/lib/badges"
import { AVAILABLE_TAGS } from "@/lib/tags"
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

const STEPS = ['Details', 'Badges', 'Complexity Level'] as const
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
  const [selectedTier, setSelectedTier] = useState<number | null>(1)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    if (isStarter && !starterProjectId) return

    const result = await onSubmit({
      title: title.trim(),
      description: description.trim(),
      tags: selectedTags,
      badges: selectedBadges,
      isStarter,
      starterProjectId: isStarter ? starterProjectId : null,
      tier: selectedTier,
    })

    if (result && result.error) return

    setTitle('')
    setDescription('')
    setSelectedTags([])
    setSelectedBadges([])
    setIsStarter(false)
    setStarterProjectId('')
    setSelectedTier(1)
    setStep(0)
  }

  const starterProject = isStarter && starterProjectId
    ? STARTER_PROJECTS.find(p => p.id === starterProjectId)
    : null

  const canProceedFromStep0 = title.trim().length > 0 && (!isStarter || starterProjectId !== '')
  const canProceedFromStep1 = true
  const canSubmit = canProceedFromStep0 && (!isStarter || starterProjectId) && selectedTier !== null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-[#3D3229]/80"
        onClick={onClose}
      />
      <div className="relative bg-cream-100 border-2 border-cream-400 max-w-lg w-full mx-4 font-mono flex flex-col max-h-[90vh]">
        <div className="bg-orange-500 px-4 py-2 flex items-center justify-between shrink-0">
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
        <div className="flex border-b-2 border-cream-400 shrink-0">
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
                  ? 'bg-cream-200 text-orange-500 border-b-2 border-orange-500 -mb-[2px]'
                  : 'text-cream-600 hover:text-brown-800'
              }`}
            >
              <span className="mr-1">{i + 1}.</span>{label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Step 1: Details */}
            {step === 0 && (
              <>
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
                    Project Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setIsStarter(false); setStarterProjectId(''); setSelectedTier(1); }}
                      className={`flex-1 px-3 py-2 text-sm uppercase transition-colors cursor-pointer ${
                        !isStarter
                          ? 'bg-orange-500 text-white'
                          : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                      }`}
                    >
                      Custom Design
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
                      Starter Project
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
                      onChange={(e) => {
                        setStarterProjectId(e.target.value)
                        const sp = STARTER_PROJECTS.find(p => p.id === e.target.value)
                        if (sp) setSelectedTier(sp.tier)
                      }}
                      className="w-full bg-cream-200 border-2 border-cream-400 text-brown-800 px-3 py-2 focus:border-orange-500 focus:outline-none transition-colors"
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
                        className={`px-3 py-1.5 text-xs uppercase transition-colors cursor-pointer ${
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
              </>
            )}

            {/* Step 2: Badges */}
            {step === 1 && (
              <div>
                <label className="block text-brown-800 text-sm uppercase mb-2">
                  Skill Badges <span className="text-cream-500">({selectedBadges.length}/{MAX_BADGES_PER_PROJECT})</span>
                </label>
                <p className="text-cream-600 text-xs mb-2">
                  Select up to {MAX_BADGES_PER_PROJECT} badges for skills you&apos;ll demonstrate in this project.
                  If you&apos;re unsure what skills you plan to use, you can skip this step and choose your badges later.
                </p>
                <div className="grid grid-cols-3 gap-3">
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
                        className={`flex flex-col items-center gap-1 p-2 border-2 transition-colors ${
                          isSelected
                            ? 'border-orange-500 bg-orange-500/25 cursor-pointer'
                            : isClaimed
                              ? 'border-cream-300 bg-cream-200 opacity-50 cursor-not-allowed'
                              : selectedBadges.length >= MAX_BADGES_PER_PROJECT
                                ? 'border-cream-300 bg-cream-200 opacity-50 cursor-not-allowed'
                                : 'border-cream-400 bg-cream-200 hover:border-cream-500 cursor-pointer'
                        }`}
                      >
                        <img src={getBadgeImage(badge.value)} alt={badge.label} className="w-full aspect-square object-contain" />
                        <span className={`text-xs uppercase ${isClaimed ? 'line-through text-cream-400' : isSelected ? 'bg-orange-500 text-white px-1' : 'text-brown-800'}`}>{badge.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Complexity Level */}
            {step === 2 && (
              <div>
                <label className="block text-brown-800 text-sm uppercase mb-2">
                  Complexity Level
                </label>
                {starterProject ? (
                  <p className="text-cream-600 text-xs mb-2">
                    Since you&apos;re using a starter project, the complexity level is predetermined. You can still change it if needed.
                  </p>
                ) : (
                  <p className="text-cream-600 text-xs mb-2">
                    How complex is this project? (You can change this later)
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {TIERS.map((tier) => {
                    const isRecommended = starterProject && tier.id === starterProject.tier
                    const isGreyed = starterProject && tier.id !== starterProject.tier && selectedTier !== tier.id
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setSelectedTier(selectedTier === tier.id ? null : tier.id)}
                        className={`w-full px-3 py-2 text-sm text-left transition-colors cursor-pointer border ${
                          selectedTier === tier.id
                            ? 'bg-orange-500 text-white border-orange-400'
                            : isGreyed
                              ? 'bg-cream-200 text-cream-500 border-cream-300 opacity-60'
                              : 'bg-cream-200 text-brown-800 hover:bg-cream-300 border-cream-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="uppercase font-medium">
                            {tier.name}
                            {isRecommended && selectedTier === tier.id && <span className="ml-2 text-xs font-normal opacity-80">(recommended)</span>}
                          </span>
                          <span className="text-xs opacity-80">
                            {tier.bits}&nbsp;bits · {tier.minHours}{tier.maxHours === Infinity ? '+' : `–${tier.maxHours}`}h
                          </span>
                        </div>
                        <span className={`block text-xs mt-1 ${selectedTier === tier.id ? 'text-white/70' : 'text-cream-500'}`}>
                          e.g. {tier.examples.join(', ')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Fixed navigation */}
          <div className="shrink-0 px-6 pb-6 pt-4 border-t border-cream-300">
            {step === 0 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={!canProceedFromStep0}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
              >
                Next →
              </button>
            )}
            {step === 1 && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex-1 bg-cream-300 hover:bg-cream-400 text-brown-800 py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!canProceedFromStep1}
                  className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {selectedBadges.length === 0 ? 'Skip →' : 'Next →'}
                </button>
              </div>
            )}
            {step === 2 && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bg-cream-300 hover:bg-cream-400 text-brown-800 py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-cream-400 disabled:cursor-not-allowed text-white py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Create Project
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
