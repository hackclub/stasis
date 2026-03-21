import { ProjectTag } from "@/app/generated/prisma/enums"

export type BadgeType = 
  | "I2C" | "SPI" | "WIFI" | "BLUETOOTH" | "OTHER_RF"
  | "ANALOG_SENSORS" | "DIGITAL_SENSORS" | "CAD" | "DISPLAYS" | "MOTORS"
  | "CAMERAS" | "METAL_MACHINING" | "WOOD_FASTENERS" | "MACHINE_LEARNING"
  | "MCU_INTEGRATION" | "FOUR_LAYER_PCB" | "SOLDERING";

export interface WorkSession {
  id: string
  hoursClaimed: number
  hoursApproved: number | null
  content: string | null
  createdAt: string
}

export interface ProjectBadge {
  id: string
  badge: BadgeType
  claimedAt: string
  grantedAt: string | null
}

export interface BomItem {
  id: string
  name: string
  quantity: number | null
  totalCost: number
}

export interface Project {
  id: string
  title: string
  description: string | null
  tags: ProjectTag[]
  totalHoursClaimed: number
  totalHoursApproved: number
  isStarter: boolean
  starterProjectId: string | null
  coverImage: string | null
  tier: number | null
  status: "draft" | "in_review" | "approved" | "rejected"
  createdAt: string
  workSessions: WorkSession[]
  badges: ProjectBadge[]
  bomItems: BomItem[]
}
