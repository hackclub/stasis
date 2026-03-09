import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET() {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  // Pending projects count (query projects directly)
  const pendingProjects = await prisma.project.findMany({
    where: {
      OR: [
        { designStatus: { in: ["in_review", "update_requested"] } },
        { buildStatus: { in: ["in_review", "update_requested"] } },
      ],
    },
    include: {
      workSessions: { select: { hoursClaimed: true } },
    },
  })

  const pendingCount = pendingProjects.length
  const totalPendingWorkUnits = pendingProjects.reduce((sum, p) => {
    return sum + p.workSessions.reduce((s, ws) => s + ws.hoursClaimed, 0)
  }, 0)

  // Use ProjectReviewAction (existing table) for reviewer leaderboard stats
  const allReviewActions = await prisma.projectReviewAction.findMany({
    where: { reviewerId: { not: null } },
    select: {
      reviewerId: true,
      createdAt: true,
    },
  })

  const reviewerIds = [...new Set(allReviewActions.map((r) => r.reviewerId).filter(Boolean))] as string[]
  const reviewers = reviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, image: true },
      })
    : []
  const reviewerMap = new Map(reviewers.map((r) => [r.id, r]))

  // Weekly stats
  const weeklyReviews = allReviewActions.filter((r) => new Date(r.createdAt) >= weekAgo)
  const weeklyByReviewer = new Map<string, number>()
  for (const r of weeklyReviews) {
    if (r.reviewerId) weeklyByReviewer.set(r.reviewerId, (weeklyByReviewer.get(r.reviewerId) || 0) + 1)
  }

  // All-time stats
  const allTimeByReviewer = new Map<string, number>()
  for (const r of allReviewActions) {
    if (r.reviewerId) allTimeByReviewer.set(r.reviewerId, (allTimeByReviewer.get(r.reviewerId) || 0) + 1)
  }

  const formatLeaderboard = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        reviewer: reviewerMap.get(id) || { id, name: "Unknown", image: null },
        count,
      }))

  return NextResponse.json({
    pendingCount,
    totalPendingWorkUnits: Math.round(totalPendingWorkUnits * 10) / 10,
    topReviewersWeekly: formatLeaderboard(weeklyByReviewer),
    topReviewersAllTime: formatLeaderboard(allTimeByReviewer),
  })
}
