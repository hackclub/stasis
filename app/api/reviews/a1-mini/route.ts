import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

// A1 Mini raffle: 4.5 weeks starting 2026-06-03, weeks reset Monday 00:00 EDT.
// First week is a short week (Tue–Sun), then full Mon–Sun weeks.
// EDT = UTC-4.
const WEEKS: Array<{ start: Date; end: Date; label: string }> = [
  { start: new Date("2026-06-03T04:00:00Z"), end: new Date("2026-06-09T04:00:00Z"), label: "Week 1 (Jun 3–8)" },
  { start: new Date("2026-06-09T04:00:00Z"), end: new Date("2026-06-16T04:00:00Z"), label: "Week 2 (Jun 9–15)" },
  { start: new Date("2026-06-16T04:00:00Z"), end: new Date("2026-06-23T04:00:00Z"), label: "Week 3 (Jun 16–22)" },
  { start: new Date("2026-06-23T04:00:00Z"), end: new Date("2026-06-30T04:00:00Z"), label: "Week 4 (Jun 23–29)" },
  { start: new Date("2026-06-30T04:00:00Z"), end: new Date("2026-07-06T04:00:00Z"), label: "Week 5 (Jun 30–Jul 5)" },
]

const EVENT_START = WEEKS[0].start
const EVENT_END = WEEKS[WEEKS.length - 1].end

function rafflePointsForCount(count: number): number {
  if (count < 20) return 0
  if (count < 40) return 2
  // 40+ → 5 base, +1 per 15 after 40, capped at 8
  const extra = Math.min(3, Math.floor((count - 40) / 15))
  return 5 + extra
}

function bonusBitsForCount(count: number): number {
  if (count < 20) return 0
  if (count < 40) return 20
  // 40+ → 50 base, +10 per 15 after 40, capped at 80
  const extra = Math.min(3, Math.floor((count - 40) / 15))
  return 50 + extra * 10
}

export async function GET() {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  // Every review action counts for the person who performed it, at the time
  // they performed it. First-pass reviews (SubmissionReview) and finalizations/
  // returns (ProjectReviewAction) are distinct actions created by distinct
  // flows — no single review creates both — so both earn credit and a
  // pre-reviewed project credits its first-pass and second-pass reviewers
  // separately. Stamping credit at the actor's own timestamp keeps weekly
  // counts append-only: a finalization can never move someone else's review
  // into a different week.
  const firstPassReviews = await prisma.submissionReview.findMany({
    where: {
      isAdminReview: false,
      invalidated: false,
      createdAt: { gte: EVENT_START, lt: EVENT_END },
    },
    select: { reviewerId: true, createdAt: true },
  })

  const pras = await prisma.projectReviewAction.findMany({
    where: {
      reviewerId: { not: null },
      createdAt: { gte: EVENT_START, lt: EVENT_END },
    },
    select: { reviewerId: true, createdAt: true },
  })

  // Build per-reviewer per-week counts
  // counts[reviewerId][weekIndex] = number
  const counts = new Map<string, number[]>()

  function addCount(reviewerId: string, date: Date) {
    if (!counts.has(reviewerId)) counts.set(reviewerId, new Array(WEEKS.length).fill(0))
    const weekCounts = counts.get(reviewerId)!
    for (let i = 0; i < WEEKS.length; i++) {
      if (date >= WEEKS[i].start && date < WEEKS[i].end) {
        weekCounts[i]++
        return
      }
    }
  }

  for (const sr of firstPassReviews) {
    addCount(sr.reviewerId, sr.createdAt)
  }
  for (const pra of pras) {
    if (pra.reviewerId) addCount(pra.reviewerId, pra.createdAt)
  }

  // Resolve user info
  const reviewerIds = Array.from(counts.keys())
  const users = reviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, slackDisplayName: true, image: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const entries = reviewerIds
    .map((id) => {
      const weekCounts = counts.get(id)!
      const weeklyRafflePoints = weekCounts.map(rafflePointsForCount)
      const totalRafflePoints = weeklyRafflePoints.reduce((a, b) => a + b, 0)
      const totalReviews = weekCounts.reduce((a, b) => a + b, 0)
      const user = userMap.get(id)
      return {
        reviewer: {
          id,
          name: user?.slackDisplayName || user?.name || null,
          image: user?.image ?? null,
        },
        weekCounts,
        weeklyRafflePoints,
        totalRafflePoints,
        totalReviews,
        totalBonusBits: weekCounts.map(bonusBitsForCount).reduce((a, b) => a + b, 0),
      }
    })
    .filter((e) => e.totalReviews > 0)
    .sort((a, b) => b.totalRafflePoints - a.totalRafflePoints || b.totalReviews - a.totalReviews)

  return NextResponse.json({
    weeks: WEEKS.map((w) => w.label),
    currentWeekIndex: WEEKS.findIndex((w) => {
      const now = new Date()
      return now >= w.start && now < w.end
    }),
    entries,
  })
}
