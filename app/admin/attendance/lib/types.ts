// Shared types for the attendance admin dashboard.
// These mirror the JSON contracts of /api/admin/attendance/*.

export type AttendDisplayState = "invited" | "wip" | "complete" | null

export const ATTEND_DISPLAY_LABEL: Record<NonNullable<AttendDisplayState>, string> = {
  invited: "Attend Invited",
  wip: "Attend WIP",
  complete: "Attend Complete",
}

/** Client mirror of `deriveAttendDisplayState` in lib/attend-sync.ts.
 *  Kept here so client components can derive locally without pulling
 *  server-only modules into the client bundle. */
export function deriveAttendDisplayState(c: {
  attendInvited: boolean
  attendOnboardingStarted: boolean
  attendStatus: string | null
}): AttendDisplayState {
  const s = c.attendStatus
  if (s === "complete") return "complete"
  if (s === "in_progress" || s === "awaiting_guardian") return "wip"
  if (c.attendInvited && (!c.attendOnboardingStarted || s === "invited")) return "invited"
  return null
}

export function attendDisplayTone(state: AttendDisplayState): string {
  switch (state) {
    case "complete": return "bg-green-500/20 text-green-300"
    case "wip":      return "bg-orange-500/20 text-orange-300"
    case "invited":  return "bg-yellow-500/20 text-yellow-300"
    default:         return ""
  }
}

/** Friendly explanation for the tooltip + the raw status echoed verbatim. */
export function attendStatusTooltip(state: AttendDisplayState, rawStatus: string | null | undefined): string {
  const friendly =
    state === "complete" ? "Onboarding complete on attend.hackclub.com"
    : state === "wip"      ? "Onboarding in progress on attend.hackclub.com"
    : state === "invited"  ? "Invitation sent — they haven't started onboarding yet"
    : "Not in Attend"
  return rawStatus ? `${friendly} (raw: ${rawStatus})` : friendly
}

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
  /** Includes laundered admin grants — subtract `adminGrantedDesignBits` for the
   *  earned-only number that the dashboard displays by default. */
  realBits: number
  /** DESIGN_APPROVED entries written by admin tooling rather than a real review. */
  adminGrantedDesignBits: number
  designPendingBits: number
  totalHoursClaimed: number
  topProjectTier: number | null
  reviewerWeekCount: number | null  // null when source !== REVIEWER_INCENTIVE
}

export interface DecryptedUserAddress {
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
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
  homeStreet: string | null
  homeCity: string | null
  homeState: string | null
  homeZip: string | null
  homeCountry: string | null
  /** Decrypted Stasis-user address (only present when linked to a User with
   * HCA address PII). Display fallback when home* overrides aren't set. */
  userAddress: DecryptedUserAddress | null
  flightCostEstimateCents: number | null
  flightCostUpdatedAt: string | null
  flightStipendCents: number | null
  attendInvited: boolean
  attendOnboardingStarted: boolean
  attendFlightBooked: boolean
  attendStatus: string | null
  attendCity: string | null
  attendState: string | null
  attendCountry: string | null
  attendCachedAt: string | null
  attendDisplayState: AttendDisplayState
  derivedStats: DerivedStats
  notes: string | null
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

/** Stable, deterministic color picked for an owner by id. Used everywhere
 * (filter dropdown, kanban card name, modal select, right-click submenu) so a
 * given admin always shows up in the same color. */
const OWNER_PALETTE = ['emerald', 'blue', 'purple', 'pink', 'orange', 'yellow', 'cream'] as const
export type OwnerColor = typeof OWNER_PALETTE[number]
export function ownerColor(id: string): OwnerColor {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return OWNER_PALETTE[h % OWNER_PALETTE.length]
}
/** CSS class for an owner-colored name (matches the swatch in dropdowns). */
export function ownerNameTextClass(id: string): string {
  switch (ownerColor(id)) {
    case 'emerald': return 'text-emerald-300'
    case 'blue':    return 'text-sky-300'
    case 'purple':  return 'text-violet-300'
    case 'pink':    return 'text-pink-300'
    case 'orange':  return 'text-orange-300'
    case 'yellow':  return 'text-yellow-300'
    case 'cream':   return 'text-cream-100'
  }
}

/**
 * Best-known location string for the candidate. Priority:
 *   1. Candidate-level home* override (admin-edited, source of truth)
 *   2. Decrypted Stasis-user address (linked Stasis users)
 *   3. Cached Attend city/state/country
 *   4. Manually-entered homeAirport (IATA fallback)
 * Returns null when nothing's known.
 *
 * Region rule: 2-letter state when in the US, country otherwise.
 */
type LocationRow = Pick<
  CandidateRow,
  | "homeCity" | "homeState" | "homeCountry"
  | "attendCity" | "attendState" | "attendCountry"
  | "homeAirport" | "userAddress"
>
export function locationLabel(row: LocationRow): string | null {
  const resolved = resolveLocation(row)
  if (resolved.city) {
    const region = formatRegion(resolved.country, resolved.state)
    return region ? `${resolved.city}, ${region}` : resolved.city
  }
  if (row.homeAirport) return row.homeAirport
  return null
}

/** Pick city/state/country from the highest-priority source available. Each
 * field falls back independently so a manual `homeCity` doesn't blank out a
 * Stasis-side state. */
function resolveLocation(row: LocationRow): { city: string | null; state: string | null; country: string | null } {
  return {
    city: row.homeCity ?? row.userAddress?.city ?? row.attendCity ?? null,
    state: row.homeState ?? row.userAddress?.state ?? row.attendState ?? null,
    country: row.homeCountry ?? row.userAddress?.country ?? row.attendCountry ?? null,
  }
}

const US_STATE_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "puerto rico": "PR",
}

function isUS(country: string | null | undefined): boolean {
  if (!country) return false
  const c = country.trim().toLowerCase()
  return c === "united states" || c === "united states of america" || c === "usa" || c === "us" || c === "u.s." || c === "u.s.a."
}

function normalizeUSState(state: string): string {
  const trimmed = state.trim()
  if (trimmed.length === 2) return trimmed.toUpperCase()
  return US_STATE_TO_CODE[trimmed.toLowerCase()] ?? trimmed
}

function formatRegion(country: string | null | undefined, state: string | null | undefined): string | null {
  if (isUS(country)) return state ? normalizeUSState(state) : null
  return country?.trim() || null
}

/** Earned bits for display: realBits minus laundered admin grants. */
export function earnedBits(s: DerivedStats): number {
  return s.realBits - s.adminGrantedDesignBits
}
