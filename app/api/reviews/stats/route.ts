import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET() {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Get all non-invalidated reviews for stats
  const allReviews = await prisma.submissionReview.findMany({
    where: { invalidated: false },
    select: {
      reviewerId: true,
      createdAt: true,
      result: true,
    },
  })

  // Pending submissions count
  const pendingCount = await prisma.projectSubmission.count({
    where: {
      project: {
        OR: [
          { designStatus: "in_review" },
          { buildStatus: "in_review" },
          { designStatus: "update_requested" },
          { buildStatus: "update_requested" },
        ],
      },
    },
  })

  // Total pending work units
  const pendingSubmissions = await prisma.projectSubmission.findMany({
    where: {
      project: {
        OR: [
          { designStatus: "in_review" },
          { buildStatus: "in_review" },
          { designStatus: "update_requested" },
          { buildStatus: "update_requested" },
        ],
      },
    },
    include: {
      project: {
        include: {
          workSessions: { select: { hoursClaimed: true } },
        },
      },
    },
  })

  const totalPendingWorkUnits = pendingSubmissions.reduce((sum, sub) => {
    return sum + sub.project.workSessions.reduce((s, ws) => s + ws.hoursClaimed, 0)
  }, 0)

  // Build reviewer stats
  const reviewerIds = [...new Set(allReviews.map((r) => r.reviewerId))]
  const reviewers = await prisma.user.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, name: true, image: true },
  })
  const reviewerMap = new Map(reviewers.map((r) => [r.id, r]))

  // Weekly stats
  const weeklyReviews = allReviews.filter((r) => new Date(r.createdAt) >= weekAgo)
  const weeklyByReviewer = new Map<string, number>()
  for (const r of weeklyReviews) {
    weeklyByReviewer.set(r.reviewerId, (weeklyByReviewer.get(r.reviewerId) || 0) + 1)
  }

  // All-time stats
  const allTimeByReviewer = new Map<string, number>()
  for (const r of allReviews) {
    allTimeByReviewer.set(r.reviewerId, (allTimeByReviewer.get(r.reviewerId) || 0) + 1)
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
