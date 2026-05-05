import { AttendanceStatus, CurrencyTransactionType } from "@/app/generated/prisma/enums"
import type { AttendanceCandidateSource } from "@/app/generated/prisma/enums"
import prisma from "@/lib/prisma"

export { AttendanceStatus }
export type { AttendanceCandidateSource }

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  IDENTIFIED: "Pool",
  CONTACTED: "Reached out",
  SOFT_YES: "Soft yes",
  CONFIRMED_YES: "Confirmed yes",
  DECLINED: "Declined",
  SHELVED: "Shelved",
}

export const SOURCE_LABELS: Record<AttendanceCandidateSource, string> = {
  STASIS_USER: "Stasis",
  REVIEWER_INCENTIVE: "Reviewer",
  EXTERNAL_HC: "HC Builder",
  DISCRETION: "Other",
}

// Active funnel columns shown on the kanban board (Sourcing pool lives in its
// own view; SHELVED + DECLINED collapse into a single "Inactive" rail).
export const KANBAN_COLUMNS = [
  "CONTACTED",
  "SOFT_YES",
  "CONFIRMED_YES",
  "BOOKED_FLIGHT",
] as const
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number]

export const KANBAN_COLUMN_LABELS: Record<KanbanColumn, string> = {
  CONTACTED: "Reached out",
  SOFT_YES: "Soft yes",
  CONFIRMED_YES: "Confirmed yes",
  BOOKED_FLIGHT: "Booked flight",
}

export const REAL_EFFORT_BIT_TYPES: CurrencyTransactionType[] = [
  CurrencyTransactionType.PROJECT_APPROVED,
  CurrencyTransactionType.PROJECT_APPROVED_REVERSED,
  CurrencyTransactionType.DESIGN_APPROVED,
  CurrencyTransactionType.DESIGN_APPROVED_REVERSED,
]

// Reviewer incentive program — review threshold counted from this moment
// (announced to reviewers as "11AM EST 5/5", which is 15:00 UTC).
export const REVIEWER_PROGRAM_START = new Date("2026-05-05T15:00:00Z")
export const REVIEWER_PROGRAM_THRESHOLD = 30

/** Compute the kanban column for an active-funnel candidate. */
export function kanbanColumnFor(
  outreach: AttendanceStatus,
  attendFlightBooked: boolean
): KanbanColumn | null {
  if (outreach === "DECLINED" || outreach === "SHELVED" || outreach === "IDENTIFIED") return null
  if (attendFlightBooked && outreach === "CONFIRMED_YES") return "BOOKED_FLIGHT"
  return outreach as KanbanColumn
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

/**
 * Batch-resolve derived stats for a list of candidates.
 * Returns a Map keyed by candidate.id (not userId — handles externals cleanly).
 */
export async function getDerivedStatsBatch(
  candidates: Array<{ id: string; userId: string | null; source: AttendanceCandidateSource }>
): Promise<Map<string, DerivedStats>> {
  const userIds = candidates.map((c) => c.userId).filter((u): u is string => !!u)
  const reviewerUserIds = candidates
    .filter((c) => c.source === "REVIEWER_INCENTIVE" && c.userId)
    .map((c) => c.userId as string)

  const [bitsByType, projectAgg, _hoursIgnored, reviewerCounts] = await Promise.all([
    userIds.length === 0 ? [] : prisma.currencyTransaction.groupBy({
      by: ["userId", "type"],
      where: { userId: { in: userIds } },
      _sum: { amount: true },
    }),
    userIds.length === 0 ? [] : prisma.project.findMany({
      where: { userId: { in: userIds }, deletedAt: null },
      select: {
        userId: true, tier: true, buildStatus: true, designStatus: true,
        workSessions: { select: { hoursClaimed: true } },
      },
    }),
    Promise.resolve([]),  // hours rolled up via projects below
    reviewerUserIds.length === 0 ? [] : prisma.projectReviewAction.groupBy({
      by: ["reviewerId"],
      where: {
        reviewerId: { in: reviewerUserIds },
        createdAt: { gte: REVIEWER_PROGRAM_START },
      },
      _count: true,
    }),
  ])

  // bits[userId][type] = amount
  const bitsByUser = new Map<string, Map<string, number>>()
  for (const b of bitsByType) {
    if (!b.userId) continue
    const inner = bitsByUser.get(b.userId) ?? new Map()
    inner.set(b.type, b._sum.amount ?? 0)
    bitsByUser.set(b.userId, inner)
  }

  // project agg: count + max tier + per-user hours rollup (filter dud sessions)
  const projAggByUser = new Map<string, { approved: number; submitted: number; topTier: number | null; hours: number }>()
  for (const p of projectAgg) {
    if (!p.userId) continue
    const cur = projAggByUser.get(p.userId) ?? { approved: 0, submitted: 0, topTier: null, hours: 0 }
    cur.submitted += 1
    if (p.buildStatus === "approved") cur.approved += 1
    if (p.tier != null && (cur.topTier == null || p.tier > cur.topTier)) cur.topTier = p.tier
    cur.hours += p.workSessions.reduce((s, w) => s + (w.hoursClaimed < 200 ? w.hoursClaimed : 0), 0)
    projAggByUser.set(p.userId, cur)
  }

  const reviewerCountsByUser = new Map(reviewerCounts.map((r) => [r.reviewerId!, r._count]))

  const out = new Map<string, DerivedStats>()
  for (const c of candidates) {
    if (!c.userId) {
      out.set(c.id, {
        projectsApproved: 0, projectsSubmitted: 0,
        realBits: 0, designPendingBits: 0,
        totalHoursClaimed: 0, topProjectTier: null,
        reviewerWeekCount: c.source === "REVIEWER_INCENTIVE" ? 0 : null,
      })
      continue
    }
    const bits = bitsByUser.get(c.userId)
    const realBits =
      (bits?.get(CurrencyTransactionType.PROJECT_APPROVED) ?? 0) +
      (bits?.get(CurrencyTransactionType.PROJECT_APPROVED_REVERSED) ?? 0) +
      (bits?.get(CurrencyTransactionType.DESIGN_APPROVED) ?? 0) +
      (bits?.get(CurrencyTransactionType.DESIGN_APPROVED_REVERSED) ?? 0)
    const designPendingBits =
      (bits?.get(CurrencyTransactionType.DESIGN_APPROVED) ?? 0) +
      (bits?.get(CurrencyTransactionType.DESIGN_APPROVED_REVERSED) ?? 0)
    const proj = projAggByUser.get(c.userId) ?? { approved: 0, submitted: 0, topTier: null, hours: 0 }
    out.set(c.id, {
      projectsApproved: proj.approved,
      projectsSubmitted: proj.submitted,
      realBits,
      designPendingBits,
      totalHoursClaimed: proj.hours,
      topProjectTier: proj.topTier,
      reviewerWeekCount: c.source === "REVIEWER_INCENTIVE" ? (reviewerCountsByUser.get(c.userId) ?? 0) : null,
    })
  }
  return out
}
