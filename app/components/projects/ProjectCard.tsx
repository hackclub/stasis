'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ProjectTag } from "@/app/generated/prisma/enums"
import { STARTER_PROJECT_NAMES } from "@/lib/starter-projects"
import { getBadgeImage } from "@/lib/badges";

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
  starterProjectId: string | null
  coverImage: string | null
  status: "draft" | "in_review" | "approved" | "rejected"
  badges?: ProjectBadge[]
}

interface Props {
  project: Project
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
      className="block bg-cream-100 border border-cream-400 relative select-none w-full cursor-pointer overflow-hidden hover:bg-cream-200 transition-colors group"
      data-project-card="true" 
    >
      {/* Cover Image */}
      <div className="aspect-video bg-cream-200 border-b border-cream-400 flex items-center justify-center relative overflow-hidden">
        {project.coverImage ? (
          <Image 
            src={project.coverImage} 
            alt={project.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover object-center"
            quality={90}
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-cream-300/30 to-cream-400/60" />
            <span className="text-brown-800 text-xs uppercase z-10">Missing screenshot, add one?</span>
          </>
        )}
        
        {/* Status badge */}
        <div className="absolute top-2 left-2 z-10">
          {project.status === 'in_review' ? (
            <span className="text-[10px] bg-yellow-600 text-white font-medium px-1.5 py-0.5 uppercase">
              In Review
            </span>
          ) : project.status === 'approved' ? (
            <span className="text-[10px] bg-green-600 text-white font-medium px-1.5 py-0.5 uppercase">
              Approved
            </span>
          ) : project.status === 'rejected' ? (
            <span className="text-[10px] bg-red-600 text-white font-medium px-1.5 py-0.5 uppercase">
              Rejected
            </span>
          ) : (
            <span className="text-[10px] bg-cream-400 text-brown-800 font-medium px-1.5 py-0.5 uppercase">
              Draft
            </span>
          )}
        </div>

        {project.isStarter && (
          <div className="absolute top-2 right-2 z-10">
            <span className="text-[10px] bg-orange-500 text-white font-medium px-1.5 py-0.5 uppercase">
              {project.starterProjectId ? STARTER_PROJECT_NAMES[project.starterProjectId] ?? 'Starter' : 'Starter'}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="text-orange-500 font-bold text-lg font-mono uppercase tracking-wide truncate group-hover:text-orange-400 transition-colors">
          {project.title}
        </h3>
        <p className="text-brown-800 text-sm mt-1">
          ~{project.totalHoursClaimed.toFixed(1)}h claimed
        </p>
        {project.description && (
          <p className="text-cream-600 text-xs mt-2 line-clamp-2">
            {project.description}
          </p>
        )}


        {/* Badges */}
        {(approvedBadges.length > 0 || pendingBadges.length > 0) && (
          <div className="mt-3 pt-3 border-t border-cream-400">
            <div className="flex flex-wrap gap-1">
              {approvedBadges.slice(0, 4).map((badge) => (
                <span 
                  key={badge.id}
                  className="text-[10px] bg-green-100 border border-green-500 text-green-700 px-1.5 py-0.5 uppercase flex items-center gap-1"
                  title={`${BADGE_LABELS[badge.badge]} (Approved)`}
                >
                  <img src={getBadgeImage(badge.badge)} alt="" className="w-4 h-4 object-contain" />
                      ✓ {BADGE_LABELS[badge.badge]}
                </span>
              ))}
              {pendingBadges.slice(0, 4 - approvedBadges.length).map((badge) => (
                <span 
                  key={badge.id}
                  className="text-[10px] bg-cream-200 border border-cream-400 text-brown-800 px-1.5 py-0.5 uppercase flex items-center gap-1"
                  title={`${BADGE_LABELS[badge.badge]} (Pending)`}
                >
                  <img src={getBadgeImage(badge.badge)} alt="" className="w-4 h-4 object-contain grayscale" />
                  {BADGE_LABELS[badge.badge]}
                </span>
              ))}
              {(approvedBadges.length + pendingBadges.length) > 4 && (
                <span className="text-[10px] text-brown-800 px-1">
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
