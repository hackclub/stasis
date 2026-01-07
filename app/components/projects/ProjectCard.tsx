'use client';

import { ProjectTag } from "@/app/generated/prisma/enums"

interface Project {
  id: string
  title: string
  description: string | null
  tags: ProjectTag[]
  totalHours: number
  isStarter: boolean
}

interface Props {
  project: Project
  onClick?: () => void
  selected?: boolean
}

const TAG_LABELS: Record<ProjectTag, string> = {
  PCB: "PCB",
  ROBOT: "Robot",
  CAD: "CAD",
  ARDUINO: "Arduino",
  RASPBERRY_PI: "Raspberry Pi",
}

export function ProjectCard({ project, onClick, selected = false }: Readonly<Props>) {
  return (
    <>
      <style jsx>{`
        @keyframes selected-bounce {
          0% { transform: scale(1) rotate(0deg); }
          20% { transform: scale(0.97) rotate(0deg); }
          100% { transform: scale(1.02) rotate(0.5deg); }
        }

        .card {
          transform: scale(1) rotate(0deg);
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .card.selected {
          animation: selected-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          transform: scale(1.02) rotate(0.5deg);
        }
      `}</style>
      <button 
        className={`card aspect-square bg-cream-950 relative select-none w-full cursor-pointer overflow-hidden flex flex-col p-4 text-left ${selected ? 'selected' : ''}`}
        data-project-card="true" 
        onClick={onClick}
      >
        <h3 className="text-cream-100 text-lg font-mono uppercase tracking-wide truncate">
          {project.title}
        </h3>
        <p className="text-cream-500 text-sm mt-1">
          ~{project.totalHours.toFixed(1)} hours
        </p>
        {project.description && (
          <p className="text-cream-600 text-xs mt-2 line-clamp-2">
            {project.description}
          </p>
        )}
        <div className="flex flex-wrap gap-1 mt-auto pt-2">
          {project.tags.slice(0, 3).map((tag) => (
            <span 
              key={tag} 
              className="text-[10px] bg-cream-850 text-cream-500 px-1.5 py-0.5 uppercase"
            >
              {TAG_LABELS[tag]}
            </span>
          ))}
        </div>
        {project.isStarter && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] bg-brand-500 text-brand-900 px-1.5 py-0.5 uppercase">
              Starter
            </span>
          </div>
        )}
      </button>
    </>
  )
}
