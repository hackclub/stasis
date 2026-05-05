// Shared types for the attendance admin dashboard.
// These mirror the JSON contracts of /api/admin/attendance/*.

export type AttendanceStatus =
  | "IDENTIFIED"
  | "CONTACTED"
  | "SOFT_YES"
  | "CONFIRMED_YES"
  | "DECLINED"

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  IDENTIFIED: "Identified",
  CONTACTED: "Contacted",
  SOFT_YES: "Soft yes",
  CONFIRMED_YES: "Confirmed yes",
  DECLINED: "Declined",
}

export type KanbanColumn = AttendanceStatus | "BOOKED_FLIGHT"

export const KANBAN_ORDER: KanbanColumn[] = [
  "IDENTIFIED",
  "CONTACTED",
  "SOFT_YES",
  "CONFIRMED_YES",
  "BOOKED_FLIGHT",
  "DECLINED",
]

export const KANBAN_LABEL: Record<KanbanColumn, string> = {
  ...STATUS_LABEL,
  BOOKED_FLIGHT: "Booked flight",
}

export interface CandidateRow {
  id: string
  userId: string | null
  name: string | null
  email: string | null
  slackId: string | null
  image: string | null
  pronouns: string | null
  eventPreference: string | null
  outreachStatus: AttendanceStatus
  ownerId: string | null
  owner: { id: string; name: string | null; email: string; image: string | null } | null
  snoozedUntil: string | null
  attendInvited: boolean
  attendFlightBooked: boolean
  attendCachedAt: string | null
  realBits: number
  projectCount: number
  flakeNote: string | null
  hasNotes: boolean
  commsCount: number
  remindersCount: number
  lastComms: { createdAt: string; text: string; authorId: string } | null
  createdAt: string
  updatedAt: string
}

export interface AdminUser {
  id: string
  name: string | null
  email: string
  image: string | null
}

export function kanbanColumnFor(row: Pick<CandidateRow, "outreachStatus" | "attendFlightBooked">): KanbanColumn {
  if (row.outreachStatus === "DECLINED") return "DECLINED"
  if (row.attendFlightBooked && row.outreachStatus === "CONFIRMED_YES") return "BOOKED_FLIGHT"
  return row.outreachStatus
}

export function statusTone(status: AttendanceStatus): string {
  switch (status) {
    case "DECLINED":      return "text-red-400"
    case "CONFIRMED_YES": return "text-green-500"
    case "SOFT_YES":      return "text-yellow-500"
    case "CONTACTED":     return "text-orange-400"
    case "IDENTIFIED":    return "text-cream-200"
  }
}

// Stage progression tone — used to colorize the pipeline so the funnel is
// scannable at a glance. BOOKED_FLIGHT is emerald-300 (one step brighter than
// CONFIRMED_YES) since it represents an additional commitment.
export function kanbanColumnTone(col: KanbanColumn): string {
  switch (col) {
    case "DECLINED":      return "text-red-400"
    case "BOOKED_FLIGHT": return "text-emerald-300"
    case "CONFIRMED_YES": return "text-green-500"
    case "SOFT_YES":      return "text-yellow-500"
    case "CONTACTED":     return "text-orange-400"
    case "IDENTIFIED":    return "text-cream-300"
  }
}

export function kanbanColumnAccent(col: KanbanColumn): string {
  switch (col) {
    case "DECLINED":      return "bg-red-500/60"
    case "BOOKED_FLIGHT": return "bg-emerald-400/70"
    case "CONFIRMED_YES": return "bg-green-500/60"
    case "SOFT_YES":      return "bg-yellow-500/60"
    case "CONTACTED":     return "bg-orange-500/60"
    case "IDENTIFIED":    return "bg-cream-300/30"
  }
}

export function statusBg(status: AttendanceStatus): string {
  switch (status) {
    case "DECLINED":      return "bg-red-500/20 text-red-300"
    case "CONFIRMED_YES": return "bg-green-500/20 text-green-400"
    case "SOFT_YES":      return "bg-yellow-500/25 text-yellow-300"
    case "CONTACTED":     return "bg-orange-500/20 text-orange-300"
    case "IDENTIFIED":    return "bg-cream-200/10 text-cream-200"
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) {
    // future: snoozed_until
    const d = Math.ceil(-ms / 86_400_000)
    if (d > 0) return `in ${d}d`
    const h = Math.ceil(-ms / 3_600_000)
    return `in ${h}h`
  }
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  return `${mo}mo ago`
}

export function touchHealth(lastIso: string | null): "fresh" | "stale" | "cold" | "untouched" {
  if (!lastIso) return "untouched"
  const days = (Date.now() - new Date(lastIso).getTime()) / 86_400_000
  if (days <= 3) return "fresh"
  if (days <= 7) return "stale"
  return "cold"
}
