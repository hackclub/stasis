'use client';

import { useState } from 'react';
import { ProjectTag } from "@/app/generated/prisma/enums"

interface Props {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    title: string
    description: string
    tags: ProjectTag[]
    isStarter: boolean
  }) => void
}

const AVAILABLE_TAGS: { value: ProjectTag; label: string }[] = [
  { value: "PCB", label: "PCB" },
  { value: "ROBOT", label: "Robot" },
  { value: "CAD", label: "CAD" },
  { value: "ARDUINO", label: "Arduino" },
  { value: "RASPBERRY_PI", label: "Raspberry Pi" },
]

export function NewProjectModal({ isOpen, onClose, onSubmit }: Readonly<Props>) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTags, setSelectedTags] = useState<ProjectTag[]>([])
  const [isStarter, setIsStarter] = useState(false)

  if (!isOpen) return null

  const handleTagToggle = (tag: ProjectTag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      tags: selectedTags,
      isStarter,
    })

    setTitle('')
    setDescription('')
    setSelectedTags([])
    setIsStarter(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-cream-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-cream-900 border-2 border-cream-600 max-w-lg w-full mx-4 font-mono">
        <div className="bg-brand-500 px-4 py-2 flex items-center justify-between">
          <h2 className="text-brand-900 text-lg uppercase tracking-wide">
            New Project
          </h2>
          <button 
            onClick={onClose}
            className="text-brand-900 hover:text-brand-950 transition-colors cursor-pointer"
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

          <button
            type="submit"
            disabled={!title.trim()}
            className="w-full bg-brand-500 hover:bg-brand-400 disabled:bg-cream-600 disabled:cursor-not-allowed text-brand-900 py-3 text-lg uppercase tracking-wider transition-colors cursor-pointer"
          >
            Create Project
          </button>
        </form>
      </div>
    </div>
  )
}
