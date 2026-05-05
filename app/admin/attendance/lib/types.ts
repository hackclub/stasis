// Shared types for the attendance admin dashboard.
// These mirror the JSON contracts of /api/admin/attendance/*.

export type AttendanceStatus =
  | "IDENTIFIED"
  | "CONTACTED"
  | "SOFT_YES"
  | "CONFIRMED_YES"
  | "DECLINED"
  | "SHELVED"

export type AttendanceCandidateSource =
  | "STASIS_USER"
  | "REVIEWER_INCENTIVE"
  | "EXTERNAL_HC"
  | "DISCRETION"

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  IDENTIFIED: "Pool",
  CONTACTED: "Reached out",
  SOFT_YES: "Soft yes",
  CONFIRMED_YES: "Confirmed yes",
  DECLINED: "Declined",
  SHELVED: "Shelved",
}

export const SOURCE_LABEL: Record<AttendanceCandidateSource, string> = {
  STASIS_USER: "Stasis",
  REVIEWER_INCENTIVE: "Reviewer",
  EXTERNAL_HC: "HC Builder",
  DISCRETION: "Other",
}

export const SOURCE_FULL_LABEL: Record<AttendanceCandidateSource, string> = {
  STASIS_USER: "Stasis user",
  REVIEWER_INCENTIVE: "Reviewer incentive",
  EXTERNAL_HC: "Hack Club builder",
  DISCRETION: "Other",
}

// Active funnel columns shown on the kanban board. IDENTIFIED → Sourcing view;
// SHELVED + DECLINED → Inactive bucket (toggleable rail).
export type KanbanColumn = "CONTACTED" | "SOFT_YES" | "CONFIRMED_YES" | "BOOKED_FLIGHT"

export const KANBAN_ORDER: KanbanColumn[] = [
  "CONTACTED",
  "SOFT_YES",
  "CONFIRMED_YES",
  "BOOKED_FLIGHT",
]

export const KANBAN_LABEL: Record<KanbanColumn, string> = {
  CONTACTED: "Reached out",
  SOFT_YES: "Soft yes",
  CONFIRMED_YES: "Confirmed yes",
  BOOKED_FLIGHT: "Booked flight",
}

export interface DerivedStats {
  projectsApproved: number
  projectsSubmitted: number
  realBits: number
  designPendingBits: number
  totalHoursClaimed: number
  topProjectTier: number | null
  reviewerWeekCount: number | null  // null when source !== REVIEWER_INCENTIVE
}

export interface CandidateRow {
  id: string
  userId: string | null
  name: string | null
  email: string | null
  slackId: string | null
  image: string | null
  pronouns: string | null
  outreachStatus: AttendanceStatus
  source: AttendanceCandidateSource
  ownerId: string | null
  owner: { id: string; name: string | null; email: string; image: string | null } | null
  invitedAt: string | null
  isGirl: boolean | null
  homeAirport: string | null
  homeCity: string | null
  flightCostEstimateCents: number | null
  flightCostUpdatedAt: string | null
  flightStipendCents: number | null
  attendInvited: boolean
  attendFlightBooked: boolean
  attendCity: string | null
  attendState: string | null
  attendCountry: string | null
  attendCachedAt: string | null
  derivedStats: DerivedStats
  caseForThem: string | null
  statusNote: string | null
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

/** Returns the active-funnel column for a row, or null when not in the funnel. */
export function kanbanColumnFor(
  row: Pick<CandidateRow, "outreachStatus" | "attendFlightBooked">
): KanbanColumn | null {
  const s = row.outreachStatus
  if (s === "IDENTIFIED" || s === "DECLINED" || s === "SHELVED") return null
  if (row.attendFlightBooked && s === "CONFIRMED_YES") return "BOOKED_FLIGHT"
  return s
}

export function statusTone(status: AttendanceStatus): string {
  switch (status) {
    case "DECLINED":      return "text-red-400"
    case "SHELVED":       return "text-cream-400"
    case "CONFIRMED_YES": return "text-green-500"
    case "SOFT_YES":      return "text-yellow-500"
    case "CONTACTED":     return "text-orange-400"
    case "IDENTIFIED":    return "text-cream-200"
  }
}

export function kanbanColumnTone(col: KanbanColumn): string {
  switch (col) {
    case "BOOKED_FLIGHT": return "text-emerald-300"
    case "CONFIRMED_YES": return "text-green-500"
    case "SOFT_YES":      return "text-yellow-500"
    case "CONTACTED":     return "text-orange-400"
  }
}

export function kanbanColumnAccent(col: KanbanColumn): string {
  switch (col) {
    case "BOOKED_FLIGHT": return "bg-emerald-400/70"
    case "CONFIRMED_YES": return "bg-green-500/60"
    case "SOFT_YES":      return "bg-yellow-500/60"
    case "CONTACTED":     return "bg-orange-500/60"
  }
}

export function statusBg(status: AttendanceStatus): string {
  switch (status) {
    case "DECLINED":      return "bg-red-500/20 text-red-300"
    case "SHELVED":       return "bg-cream-200/10 text-cream-300 line-through decoration-cream-300/40"
    case "CONFIRMED_YES": return "bg-green-500/20 text-green-400"
    case "SOFT_YES":      return "bg-yellow-500/25 text-yellow-300"
    case "CONTACTED":     return "bg-orange-500/20 text-orange-300"
    case "IDENTIFIED":    return "bg-cream-200/10 text-cream-200"
  }
}

export function sourceBadgeClass(source: AttendanceCandidateSource): string {
  switch (source) {
    case "STASIS_USER":         return "bg-orange-500/15 text-orange-300"
    case "REVIEWER_INCENTIVE":  return "bg-purple-500/20 text-purple-300"
    case "EXTERNAL_HC":         return "bg-blue-500/20 text-blue-300"
    case "DISCRETION":          return "bg-cream-200/10 text-cream-200"
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) {
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

/** Format cents as a dollar string. 0 → "$0", 250000 → "$2,500". */
export function formatDollars(cents: number | null | undefined): string {
  if (cents == null) return "—"
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

/**
 * Best-known location string for the candidate, in priority order:
 * 1. Manually-entered homeCity (admin override)
 * 2. Cached Attend city/state
 * 3. Manually-entered homeAirport (IATA)
 * Returns null when nothing's known.
 */
export function locationLabel(row: Pick<CandidateRow, "homeCity" | "attendCity" | "attendState" | "attendCountry" | "homeAirport">): string | null {
  if (row.homeCity) return row.homeCity
  if (row.attendCity) {
    const region = row.attendState ?? row.attendCountry
    return region ? `${row.attendCity}, ${region}` : row.attendCity
  }
  if (row.homeAirport) return row.homeAirport
  return null
}

/** One-line derived stats summary used on cards/rows. Wide dot separator
 * (en-space + middle dot + en-space) so the cluster reads at small sizes. */
export function derivedStatLine(row: CandidateRow): string {
  const s = row.derivedStats
  if (row.source === "REVIEWER_INCENTIVE" && s.reviewerWeekCount != null) {
    return `${s.reviewerWeekCount}/30 reviews`
  }
  const parts: string[] = []
  if (s.topProjectTier != null) parts.push(`T${s.topProjectTier}`)
  if (s.realBits) parts.push(`${s.realBits}b`)
  if (s.totalHoursClaimed) parts.push(`${s.totalHoursClaimed.toFixed(0)}h`)
  if (s.projectsSubmitted) parts.push(`${s.projectsSubmitted}p`)
  return parts.length > 0 ? parts.join("\u2002·\u2002") : "—"
}
