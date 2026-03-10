import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
  twelveMonthsAgo.setDate(1)
  twelveMonthsAgo.setHours(0, 0, 0, 0)

  const [
    // Projects
    projectCount,
    projectsByDesignStatus,
    projectsByBuildStatus,
    projectsByTier,

    // Users
    userCount,
    usersWithProjects,
    fraudCount,
    signupsByMonth,

    // Time tracking
    timeAggregates,
    sessionCount,
    categoryBreakdown,

    // Economy
    economyByType,
    balanceStats,

    // Badges
    badgesByType,

    // Reviews
    reviewsByDecision,
    topReviewers,

    // BOM
    bomByStatus,
    bomApprovedCost,

    // Qualification
    qualificationStats,
  ] = await Promise.all([
    // --- Projects ---
    prisma.project.count(),

    prisma.project.groupBy({
      by: ["designStatus"],
      _count: { _all: true },
    }),

    prisma.project.groupBy({
      by: ["buildStatus"],
      _count: { _all: true },
    }),

    prisma.project.groupBy({
      by: ["tier"],
      _count: { _all: true },
    }),

    // --- Users ---
    prisma.user.count(),

    prisma.project.groupBy({
      by: ["userId"],
    }).then((rows) => rows.length),

    prisma.user.count({ where: { fraudConvicted: true } }),

    prisma.$queryRaw<{ month: string; count: bigint }[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') as month,
             COUNT(*)::bigint as count
      FROM "user"
      WHERE "createdAt" >= ${twelveMonthsAgo}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY DATE_TRUNC('month', "createdAt")
    `,

    // --- Time tracking ---
    prisma.workSession.aggregate({
      _sum: { hoursClaimed: true, hoursApproved: true },
    }),

    prisma.workSession.count(),

    prisma.$queryRaw<{ category: string; count: bigint }[]>`
      SELECT unnest(categories::text[]) as category, COUNT(*)::bigint as count
      FROM work_session
      GROUP BY category
      ORDER BY count DESC
    `,

    // --- Economy ---
    prisma.currencyTransaction.groupBy({
      by: ["type"],
      _sum: { amount: true },
      _count: { _all: true },
    }),

    prisma.$queryRaw<{ avg_balance: number; median_balance: number; total_users: bigint }[]>`
      SELECT
        COALESCE(AVG(balance), 0)::float as avg_balance,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY balance), 0)::float as median_balance,
        COUNT(*)::bigint as total_users
      FROM (
        SELECT "userId", SUM(amount) as balance
        FROM currency_transaction
        GROUP BY "userId"
      ) sub
    `,

    // --- Badges ---
    prisma.projectBadge.groupBy({
      by: ["badge"],
      _count: { _all: true },
      orderBy: { _count: { badge: "desc" } },
    }),

    // --- Reviews ---
    prisma.projectReviewAction.groupBy({
      by: ["decision"],
      _count: { _all: true },
    }),

    prisma.$queryRaw<{ reviewerId: string; count: bigint }[]>`
      SELECT "reviewerId", COUNT(*)::bigint as count
      FROM project_review_action
      WHERE "reviewerId" IS NOT NULL
      GROUP BY "reviewerId"
      ORDER BY count DESC
      LIMIT 10
    `,

    // --- BOM ---
    prisma.bOMItem.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),

    prisma.$queryRaw<{ total_cost: number }[]>`
      SELECT COALESCE(SUM("costPerItem" * quantity), 0)::float as total_cost
      FROM bom_item
      WHERE status = 'approved'
    `,

    // --- Qualification ---
    prisma.$queryRaw<{ qualified_stasis: bigint; qualified_opensauce: bigint; total_with_bits: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE balance >= 350)::bigint as qualified_stasis,
        COUNT(*) FILTER (WHERE balance >= 250)::bigint as qualified_opensauce,
        COUNT(*)::bigint as total_with_bits
      FROM (
        SELECT "userId", SUM(amount) as balance
        FROM currency_transaction
        GROUP BY "userId"
        HAVING SUM(amount) > 0
      ) sub
    `,
  ])

  // Fetch reviewer names for top reviewers
  const reviewerIds = topReviewers.map((r) => r.reviewerId)
  const reviewerUsers = reviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, image: true },
      })
    : []
  const reviewerMap = new Map(reviewerUsers.map((u) => [u.id, u]))

  // Format response
  const designStatusMap: Record<string, number> = {}
  for (const row of projectsByDesignStatus) {
    designStatusMap[row.designStatus] = row._count._all
  }

  const buildStatusMap: Record<string, number> = {}
  for (const row of projectsByBuildStatus) {
    buildStatusMap[row.buildStatus] = row._count._all
  }

  const tierMap: Record<string, number> = {}
  for (const row of projectsByTier) {
    tierMap[row.tier?.toString() ?? "untiered"] = row._count._all
  }

  const categoryMap: Record<string, number> = {}
  for (const row of categoryBreakdown) {
    categoryMap[row.category] = Number(row.count)
  }

  const economyTypeMap: Record<string, { sum: number; count: number }> = {}
  for (const row of economyByType) {
    economyTypeMap[row.type] = {
      sum: row._sum.amount ?? 0,
      count: row._count._all,
    }
  }

  const badgeMap: Record<string, number> = {}
  for (const row of badgesByType) {
    badgeMap[row.badge] = row._count._all
  }

  const decisionMap: Record<string, number> = {}
  for (const row of reviewsByDecision) {
    decisionMap[row.decision] = row._count._all
  }

  const bomStatusMap: Record<string, number> = {}
  for (const row of bomByStatus) {
    bomStatusMap[row.status] = row._count._all
  }

  const balance = balanceStats[0] ?? { avg_balance: 0, median_balance: 0, total_users: BigInt(0) }
  const qual = qualificationStats[0] ?? { qualified_stasis: BigInt(0), qualified_opensauce: BigInt(0), total_with_bits: BigInt(0) }

  const totalDistributed = Object.entries(economyTypeMap)
    .filter(([, v]) => v.sum > 0)
    .reduce((acc, [, v]) => acc + v.sum, 0)
  const totalSpent = Math.abs(
    Object.entries(economyTypeMap)
      .filter(([, v]) => v.sum < 0)
      .reduce((acc, [, v]) => acc + v.sum, 0)
  )

  return NextResponse.json({
    projects: {
      total: projectCount,
      byDesignStatus: designStatusMap,
      byBuildStatus: buildStatusMap,
      pendingDesignReview: designStatusMap["in_review"] ?? 0,
      pendingBuildReview: buildStatusMap["in_review"] ?? 0,
      byTier: tierMap,
    },
    users: {
      total: userCount,
      withProjects: usersWithProjects,
      fraudFlagged: fraudCount,
      signupsByMonth: signupsByMonth.map((r) => ({
        month: r.month,
        count: Number(r.count),
      })),
    },
    time: {
      totalHoursClaimed: Math.round((timeAggregates._sum.hoursClaimed ?? 0) * 10) / 10,
      totalHoursApproved: Math.round((timeAggregates._sum.hoursApproved ?? 0) * 10) / 10,
      totalSessions: sessionCount,
      byCategory: categoryMap,
    },
    economy: {
      totalDistributed,
      totalSpent,
      netCirculating: totalDistributed - totalSpent,
      avgBalance: Math.round(balance.avg_balance * 10) / 10,
      medianBalance: Math.round(balance.median_balance * 10) / 10,
      byType: economyTypeMap,
    },
    badges: {
      total: Object.values(badgeMap).reduce((a, b) => a + b, 0),
      byType: badgeMap,
    },
    reviews: {
      totalActions: Object.values(decisionMap).reduce((a, b) => a + b, 0),
      byDecision: decisionMap,
      topReviewers: topReviewers.map((r) => {
        const user = reviewerMap.get(r.reviewerId)
        return {
          name: user?.name ?? "Unknown",
          image: user?.image ?? null,
          count: Number(r.count),
        }
      }),
    },
    bom: {
      totalItems: Object.values(bomStatusMap).reduce((a, b) => a + b, 0),
      totalApprovedCost: Math.round((bomApprovedCost[0]?.total_cost ?? 0) * 100) / 100,
      costPerHour: (timeAggregates._sum.hoursApproved ?? 0) > 0
        ? Math.round(((bomApprovedCost[0]?.total_cost ?? 0) / (timeAggregates._sum.hoursApproved ?? 1)) * 100) / 100
        : null,
      byStatus: bomStatusMap,
    },
    qualification: {
      qualifiedStasis: Number(qual.qualified_stasis),
      qualifiedOpenSauce: Number(qual.qualified_opensauce),
      totalUsersWithBits: Number(qual.total_with_bits),
    },
  })
}
