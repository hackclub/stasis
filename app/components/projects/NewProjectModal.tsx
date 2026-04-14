'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ProjectTag, BadgeType } from "@/app/generated/prisma/enums"
import { STARTER_PROJECTS } from "@/lib/starter-projects"
import { AVAILABLE_BADGES, MAX_BADGES_PER_PROJECT, getBadgeImage } from "@/lib/badges"
import { TIERS, BIT_SPEND_RATIO } from "@/lib/tiers"

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
    githubRepo: string
    tier: number | null
  }) => Promise<{ error?: string; projectId?: string } | void>
  error?: string | null
}

const STEPS = ['Details', 'Badges', 'Complexity'] as const
type Step = 0 | 1 | 2

export function NewProjectModal({ isOpen, onClose, onSubmit, error }: Readonly<Props>) {
  const [step, setStep] = useState<Step>(0)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTags, setSelectedTags] = useState<ProjectTag[]>([])
  const [selectedBadges, setSelectedBadges] = useState<BadgeType[]>([])
  const [isStarter, setIsStarter] = useState(false)
  const [starterProjectId, setStarterProjectId] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [selectedTier, setSelectedTier] = useState<number | null>(1)
  const [alreadyClaimedBadges, setAlreadyClaimedBadges] = useState<BadgeType[]>([])
  const [journalFile, setJournalFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [showTierHelp, setShowTierHelp] = useState(false)
  const [showTypeHelp, setShowTypeHelp] = useState(false)
  const tierHelpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typeHelpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
  }, [])

  const fetchClaimedBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/badges/claimed')
      if (res.ok) {
        setAlreadyClaimedBadges(await res.json())
      }
    } catch (err) {
      console.error('Failed to fetch claimed badges:', err)
    }
  }, [])

  useEffect(() => {
    checkScroll()
  }, [step, isOpen, checkScroll])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      setStep(0)
      setTitle('')
      setDescription('')
      setSelectedTags([])
      setSelectedBadges([])
      setIsStarter(false)
      setStarterProjectId('')
      setGithubRepo('')
      setSelectedTier(1)
      setJournalFile(null)
      setSubmitting(false)
      setShowTierHelp(false)
      setShowTypeHelp(false)
      if (tierHelpTimer.current) clearTimeout(tierHelpTimer.current)
      if (typeHelpTimer.current) clearTimeout(typeHelpTimer.current)
    } else {
      fetchClaimedBadges()
    }
  }, [isOpen, fetchClaimedBadges])

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
    setSubmitting(true)

    try {
      const result = await onSubmit({
        title: title.trim(),
        description: description.trim(),
        tags: selectedTags,
        badges: selectedBadges,
        isStarter,
        starterProjectId: isStarter ? starterProjectId : null,
        githubRepo: githubRepo.trim(),
        tier: selectedTier,
      })

      if (result && result.error) return

      if (journalFile && result && result.projectId) {
        const markdown = await journalFile.text()
        const res = await fetch(`/api/projects/${result.projectId}/sessions/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        })
        if (res.ok) {
          const data = await res.json()
          alert(`Imported ${data.imported} journal ${data.imported === 1 ? 'entry' : 'entries'}`)
        } else {
          const data = await res.json()
          alert(data.error || 'Project created, but journal import failed')
        }
      }

      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const starterProject = isStarter && starterProjectId
    ? STARTER_PROJECTS.find(p => p.id === starterProjectId)
    : null

  const canProceedFromStep0 = title.trim().length > 0 && (!isStarter || starterProjectId !== '')
  const canProceedFromStep1 = true
  const canSubmit = canProceedFromStep0 && (!isStarter || starterProjectId) && selectedTier !== null && !submitting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[#3D3229]/80"
        onClick={onClose}
      />
      <div className="relative bg-cream-100 border-2 border-cream-400 max-w-lg w-full mx-4 font-mono flex flex-col max-h-[75vh]">
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
          <div ref={scrollRef} onScroll={checkScroll} className="relative flex-1 overflow-y-auto p-6 space-y-6">
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
                  <div className="relative">
                    <label className="inline-flex items-center gap-1 text-brown-800 text-sm uppercase mb-2">
                      Project Type
                      <span
                        onMouseEnter={() => { typeHelpTimer.current = setTimeout(() => setShowTypeHelp(true), 500) }}
                        onMouseLeave={() => { if (typeHelpTimer.current) clearTimeout(typeHelpTimer.current); setShowTypeHelp(false) }}
                        className="w-3.5 h-3.5 border border-cream-500 text-cream-500 hover:border-orange-500 hover:text-orange-500 text-[10px] flex items-center justify-center cursor-help transition-colors leading-none"
                      >
                        ?
                      </span>
                    </label>
                    {showTypeHelp && (
                      <div className="absolute z-10 top-full left-0 mt-1 bg-cream-200 border border-cream-400 p-3 text-xs text-brown-800 leading-relaxed shadow-md max-w-xs">
                        <p><strong>Custom Design:</strong> This project is your own original design.</p>
                        <p className="mt-1"><strong>Starter Project:</strong> This project is based on one of our starter projects.</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setIsStarter(false); setStarterProjectId(''); setSelectedTier(1); }}
                      className={`flex-1 px-3 py-2 text-sm uppercase cursor-pointer ${
                        !isStarter
                          ? 'bg-orange-500 text-white led-flicker'
                          : 'bg-cream-300 text-brown-800 hover:bg-cream-400'
                      }`}
                    >
                      Custom Design
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsStarter(true)}
                      className={`flex-1 px-3 py-2 text-sm uppercase cursor-pointer ${
                        isStarter
                          ? 'bg-orange-500 text-white led-flicker'
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
                    GitHub Repository <span className="text-cream-500">(optional)</span>
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
                    Import Journal from Blueprint <span className="text-cream-500">(optional)</span>
                  </label>
                  <p className="text-cream-600 text-xs mb-2">
                    Export your journal from Blueprint as a Markdown file, then upload it here to import your entries.
                  </p>
                  {journalFile ? (
                    <div className="flex items-center gap-2 bg-cream-200 border-2 border-cream-400 px-3 py-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600 shrink-0">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span className="text-brown-800 text-sm truncate">{journalFile.name}</span>
                      <button
                        type="button"
                        onClick={() => setJournalFile(null)}
                        className="ml-auto text-cream-600 hover:text-red-600 transition-colors cursor-pointer shrink-0"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 bg-cream-300 hover:bg-cream-400 text-brown-800 px-3 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer border border-cream-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      Choose File
                      <input
                        type="file"
                        accept=".md,.markdown,text/markdown"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) setJournalFile(file)
                          e.target.value = ''
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </>
            )}

            {/* Step 2: Badges */}
            {step === 1 && (
              <div>
                <label className="block text-brown-800 text-sm uppercase mb-1">
                  Skill Badges <span className="text-cream-500">({selectedBadges.length}/{MAX_BADGES_PER_PROJECT})</span>
                </label>
                <p className="text-cream-600 text-sm pt-1 pb-4">
                  Select up to {MAX_BADGES_PER_PROJECT} badges for skills you&apos;ll use in this project.
                  If you ship a project with these badges, we&apos;ll send you a physical badge for each one!
                  <span className="block mt-2">You can always edit these, or you can skip this step and choose your badges later.</span>
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {AVAILABLE_BADGES.map((badge) => {
                    const isSelected = selectedBadges.includes(badge.value)
                    const isClaimed = alreadyClaimedBadges.includes(badge.value)
                    const isDisabled = isClaimed || (!isSelected && selectedBadges.length >= MAX_BADGES_PER_PROJECT)
                    return (
                      <button
                        key={badge.value}
                        type="button"
                        onClick={() => handleBadgeToggle(badge.value)}
                        disabled={isDisabled}
                        className={`flex flex-col items-center gap-1 p-2 border-2 transition-colors ${
                          isClaimed
                            ? 'border-cream-300 bg-cream-200 opacity-40 cursor-not-allowed'
                            : isSelected
                              ? 'border-orange-500 bg-orange-500/25 cursor-pointer'
                              : selectedBadges.length >= MAX_BADGES_PER_PROJECT
                                ? 'border-cream-300 bg-cream-200 opacity-50 cursor-not-allowed'
                                : 'border-cream-400 bg-cream-200 hover:border-cream-500 cursor-pointer'
                        }`}
                      >
                        <img src={getBadgeImage(badge.value)} alt={badge.label} className={`w-full aspect-square object-contain ${isClaimed ? 'grayscale' : ''}`} />
                        <span className={`text-xs uppercase ${isClaimed ? 'text-cream-500 line-through' : isSelected ? 'bg-orange-500 text-white px-1' : 'text-brown-800'}`}>
                          {isClaimed ? `${badge.label} (claimed)` : badge.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Complexity Level */}
            {step === 2 && (
              <div>
                <div className="relative">
                  <label className="inline-flex items-center gap-1 text-brown-800 text-sm uppercase mb-2">
                    Complexity Level
                    <span
                      onMouseEnter={() => { tierHelpTimer.current = setTimeout(() => setShowTierHelp(true), 500) }}
                      onMouseLeave={() => { if (tierHelpTimer.current) clearTimeout(tierHelpTimer.current); setShowTierHelp(false) }}
                      className="w-3.5 h-3.5 border border-cream-500 text-cream-500 hover:border-orange-500 hover:text-orange-500 text-[10px] flex items-center justify-center cursor-help transition-colors leading-none"
                    >
                      ?
                    </span>
                  </label>
                  {showTierHelp && (
                    <div className="absolute z-10 top-full left-0 mt-1 bg-cream-200 border border-cream-400 p-3 text-xs text-brown-800 leading-relaxed shadow-md max-w-xs">
                      Each tier represents a different level of project complexity. Higher tiers take more hours and earn more bits. You can spend up to 50% of your earned bits on parts (1 bit = $1), and the rest goes toward your qualification total.
                    </div>
                  )}
                </div>
                {starterProject ? (
                  <p className="text-cream-600 text-sm mb-2">
                    Since you&apos;re using a starter project, the complexity level is predetermined. You can still change it if needed.
                  </p>
                ) : (
                  <>
                    <p className="text-cream-600 text-sm mb-2">
                      How complex is this project? (You can change this later)
                    </p>
                    <p className="text-xs bg-orange-500/10 border border-orange-500/30 text-orange-600 px-2 py-1.5 mb-1">
                      You can spend at most <strong>50% of earned bits</strong> on parts. The rest goes toward qualification.
                    </p>
                  </>
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
                        className={`w-full px-3 py-2 text-sm text-left cursor-pointer border flex items-center justify-between ${
                          selectedTier === tier.id
                            ? 'bg-orange-500 text-white border-orange-400 led-flicker'
                            : isGreyed
                              ? 'bg-cream-200 text-cream-500 border-cream-300 opacity-60'
                              : 'bg-cream-200 text-brown-800 hover:bg-cream-300 border-cream-400'
                        }`}
                      >
                        <span className="uppercase font-medium">
                          {tier.name}
                          {isRecommended && selectedTier === tier.id && <span className="ml-2 text-sm font-normal opacity-80">(recommended)</span>}
                        </span>
                        <span className="text-sm opacity-80">
                          {tier.bits}&nbsp;bits · {tier.minHours}{tier.maxHours === Infinity ? 'h+' : `–${tier.maxHours}h`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Subtle scroll indicator */}
          <div
            className={`shrink-0 h-6 -mt-6 relative z-10 pointer-events-none bg-gradient-to-t from-cream-100 to-transparent transition-opacity duration-300 ${canScrollDown ? 'opacity-100' : 'opacity-0'}`}
          />

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
                  {submitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
