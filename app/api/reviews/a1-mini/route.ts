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

  const firstPassReviews = await prisma.submissionReview.findMany({
    where: {
      isAdminReview: false,
      invalidated: false,
      createdAt: { gte: EVENT_START, lt: EVENT_END },
    },
    select: {
      reviewerId: true,
      createdAt: true,
      submission: { select: { projectId: true, stage: true } },
    },
  })

  const pras = await prisma.projectReviewAction.findMany({
    where: {
      reviewerId: { not: null },
      createdAt: { gte: EVENT_START, lt: EVENT_END },
    },
    select: {
      id: true,
      reviewerId: true,
      projectId: true,
      stage: true,
      createdAt: true,
    },
  })

  // Resolve first-pass reviewer attribution for PRAs (same logic as windbreaker)
  const projectIds = Array.from(new Set(pras.map((p) => p.projectId)))
  const submissions = projectIds.length > 0
    ? await prisma.projectSubmission.findMany({
        where: { projectId: { in: projectIds } },
        select: {
          id: true,
          projectId: true,
          stage: true,
          createdAt: true,
          reviews: {
            where: { isAdminReview: false, invalidated: false },
            select: { reviewerId: true, createdAt: true },
          },
        },
      })
    : []

  const submissionsByProjectStage = new Map<string, typeof submissions>()
  for (const s of submissions) {
    const key = `${s.projectId}:${s.stage}`
    const arr = submissionsByProjectStage.get(key) ?? []
    arr.push(s)
    submissionsByProjectStage.set(key, arr)
  }
  for (const arr of submissionsByProjectStage.values()) {
    arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  function firstPassReviewerFor(pra: (typeof pras)[number]): string | null {
    const key = `${pra.projectId}:${pra.stage}`
    const subs = submissionsByProjectStage.get(key) ?? []
    const sub = subs.find((s) => s.createdAt.getTime() <= pra.createdAt.getTime())
    if (!sub) return null
    const fp = sub.reviews
      .filter((r) => r.createdAt.getTime() <= pra.createdAt.getTime())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    return fp?.reviewerId ?? null
  }

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

  // Build PRA lookup for dedup
  const prasByProjectStage = new Map<string, Array<{ createdAt: Date }>>()
  for (const pra of pras) {
    const key = `${pra.projectId}:${pra.stage}`
    const arr = prasByProjectStage.get(key) ?? []
    arr.push({ createdAt: pra.createdAt })
    prasByProjectStage.set(key, arr)
  }

  for (const pra of pras) {
    const fpReviewerId = firstPassReviewerFor(pra)
    const attributedId = fpReviewerId ?? pra.reviewerId
    if (!attributedId) continue
    addCount(attributedId, pra.createdAt)
  }

  for (const sr of firstPassReviews) {
    const key = `${sr.submission.projectId}:${sr.submission.stage}`
    const pralist = prasByProjectStage.get(key) ?? []
    const finalized = pralist.some((p) => p.createdAt.getTime() >= sr.createdAt.getTime())
    if (finalized) continue
    addCount(sr.reviewerId, sr.createdAt)
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
