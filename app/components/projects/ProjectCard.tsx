'use client';

import Link from 'next/link';
import { ProjectTag } from "@/app/generated/prisma/enums"

type BadgeType = 
  | "I2C" | "SPI" | "WIFI" | "BLUETOOTH" | "OTHER_RF"
  | "ANALOG_SENSORS" | "DIGITAL_SENSORS" | "CAD" | "DISPLAYS" | "MOTORS"
  | "CAMERAS" | "METAL_MACHINING" | "WOOD_FASTENERS" | "MACHINE_LEARNING"
  | "MCU_INTEGRATION" | "FOUR_LAYER_PCB" | "SOLDERING";

interface ProjectBadge {
  id: string
  badge: BadgeType
  grantedAt: string | null
}

interface Project {
  id: string
  title: string
  description: string | null
  tags: ProjectTag[]
  totalHoursClaimed: number
  totalHoursApproved: number
  isStarter: boolean
  badges?: ProjectBadge[]
}

interface Props {
  project: Project
}

const TAG_LABELS: Record<ProjectTag, string> = {
  PCB: "PCB",
  ROBOT: "Robot",
  CAD: "CAD",
  ARDUINO: "Arduino",
  RASPBERRY_PI: "Raspberry Pi",
}

const BADGE_LABELS: Record<BadgeType, string> = {
  I2C: "I2C",
  SPI: "SPI",
  WIFI: "WiFi",
  BLUETOOTH: "BT",
  OTHER_RF: "RF",
  ANALOG_SENSORS: "Analog",
  DIGITAL_SENSORS: "Digital",
  CAD: "CAD",
  DISPLAYS: "Display",
  MOTORS: "Motors",
  CAMERAS: "Cameras",
  METAL_MACHINING: "Metal",
  WOOD_FASTENERS: "Wood",
  MACHINE_LEARNING: "ML",
  MCU_INTEGRATION: "MCU",
  FOUR_LAYER_PCB: "4L PCB",
  SOLDERING: "Solder",
}

export function ProjectCard({ project }: Readonly<Props>) {
  const approvedBadges = project.badges?.filter(b => b.grantedAt !== null) ?? [];
  const pendingBadges = project.badges?.filter(b => b.grantedAt === null) ?? [];

  return (
    <Link 
      href={`/dashboard/projects/${project.id}`}
      className="block bg-cream-950 relative select-none w-full cursor-pointer overflow-hidden hover:bg-cream-900 transition-colors group"
      data-project-card="true" 
    >
      {/* Placeholder Image */}
      <div className="aspect-video bg-cream-900 border-b border-cream-800 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cream-800/50 to-cream-950/50" />
        <span className="text-cream-700 text-xs uppercase z-10">Project Preview</span>
        
        {project.isStarter && (
          <div className="absolute top-2 right-2 z-10">
            <span className="text-[10px] bg-brand-500 text-brand-900 px-1.5 py-0.5 uppercase">
              Starter
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-cream-100 text-lg font-mono uppercase tracking-wide truncate group-hover:text-brand-500 transition-colors">
          {project.title}
        </h3>
        <p className="text-cream-500 text-sm mt-1">
          ~{project.totalHoursClaimed.toFixed(1)}h claimed
        </p>
        {project.description && (
          <p className="text-cream-600 text-xs mt-2 line-clamp-2">
            {project.description}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-3">
          {project.tags.slice(0, 3).map((tag) => (
            <span 
              key={tag} 
              className="text-[10px] bg-cream-850 text-cream-500 px-1.5 py-0.5 uppercase"
            >
              {TAG_LABELS[tag]}
            </span>
          ))}
        </div>

        {/* Badges */}
        {(approvedBadges.length > 0 || pendingBadges.length > 0) && (
          <div className="mt-3 pt-3 border-t border-cream-800">
            <div className="flex flex-wrap gap-1">
              {approvedBadges.slice(0, 4).map((badge) => (
                <span 
                  key={badge.id}
                  className="text-[10px] bg-green-600/30 border border-green-600/50 text-green-500 px-1.5 py-0.5 uppercase"
                  title={`${BADGE_LABELS[badge.badge]} (Approved)`}
                >
                  ✓ {BADGE_LABELS[badge.badge]}
                </span>
              ))}
              {pendingBadges.slice(0, 4 - approvedBadges.length).map((badge) => (
                <span 
                  key={badge.id}
                  className="text-[10px] bg-cream-800 border border-cream-700 text-cream-500 px-1.5 py-0.5 uppercase"
                  title={`${BADGE_LABELS[badge.badge]} (Pending)`}
                >
                  {BADGE_LABELS[badge.badge]}
                </span>
              ))}
              {(approvedBadges.length + pendingBadges.length) > 4 && (
                <span className="text-[10px] text-cream-600 px-1">
                  +{(approvedBadges.length + pendingBadges.length) - 4}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}
