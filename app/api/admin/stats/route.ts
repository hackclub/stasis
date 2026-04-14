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
    projectsByTierDetailed,

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

    // User demographics
    pronounsByCount,
    goalByCount,

    // New metrics
    funnelStats,
    bitsFunnelStats,
    weeklyTrends,
    reviewTurnaround,
    balanceDistribution,
    projectPipeline,
  ] = await Promise.all([
    // --- Projects ---
    prisma.project.count({ where: { deletedAt: null } }),

    prisma.project.groupBy({
      by: ["designStatus"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),

    prisma.project.groupBy({
      by: ["buildStatus"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),

    prisma.project.groupBy({
      by: ["tier"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),

    // Projects by tier with approved vs pending breakdown
    prisma.$queryRaw<{ tier: number | null; approved: bigint; pending: bigint }[]>`
      SELECT
        tier,
        COUNT(*) FILTER (WHERE "buildStatus" = 'approved')::bigint AS approved,
        COUNT(*) FILTER (WHERE "buildStatus" != 'approved')::bigint AS pending
      FROM project
      WHERE "deletedAt" IS NULL
      GROUP BY tier
      ORDER BY tier NULLS LAST
    `,

    // --- Users ---
    prisma.user.count(),

    prisma.project.groupBy({
      by: ["userId"],
      where: { deletedAt: null },
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
      where: { project: { deletedAt: null } },
      _sum: { hoursClaimed: true, hoursApproved: true },
    }),

    prisma.workSession.count({
      where: { project: { deletedAt: null } },
    }),

    prisma.$queryRaw<{ category: string; count: bigint }[]>`
      SELECT unnest(ws.categories::text[]) as category, COUNT(*)::bigint as count
      FROM work_session ws
      JOIN project p ON ws."projectId" = p.id
      WHERE p."deletedAt" IS NULL
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
      where: { project: { deletedAt: null } },
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
      where: { project: { deletedAt: null } },
      _count: { _all: true },
    }),

    prisma.$queryRaw<{ total_cost: number }[]>`
      SELECT COALESCE(SUM(b."totalCost"), 0)::float as total_cost
      FROM bom_item b
      JOIN project p ON b."projectId" = p.id
      WHERE b.status = 'approved' AND p."deletedAt" IS NULL
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

    // --- User pronouns (gender ratio) ---
    prisma.$queryRaw<{ pronouns: string | null; count: bigint }[]>`
      SELECT pronouns, COUNT(*)::bigint as count
      FROM "user"
      GROUP BY pronouns
      ORDER BY count DESC
    `,

    // --- User goal preference ---
    prisma.$queryRaw<{ goal: string | null; count: bigint }[]>`
      SELECT "eventPreference" as goal, COUNT(*)::bigint as count
      FROM "user"
      GROUP BY "eventPreference"
      ORDER BY count DESC
    `,

    // --- User Funnel ---
    prisma.$queryRaw<{ step: string; count: bigint }[]>`
      SELECT 'signed_up' as step, COUNT(*)::bigint as count FROM "user"
      UNION ALL
      SELECT 'created_project', COUNT(DISTINCT "userId")::bigint FROM project WHERE "deletedAt" IS NULL
      UNION ALL
      SELECT 'design_submitted', COUNT(DISTINCT "userId")::bigint FROM project WHERE "deletedAt" IS NULL AND "designStatus" != 'draft'
      UNION ALL
      SELECT 'design_approved', COUNT(DISTINCT "userId")::bigint FROM project WHERE "deletedAt" IS NULL AND "designStatus" = 'approved'
      UNION ALL
      SELECT 'build_submitted', COUNT(DISTINCT "userId")::bigint FROM project WHERE "deletedAt" IS NULL AND "buildStatus" != 'draft'
      UNION ALL
      SELECT 'build_approved', COUNT(DISTINCT "userId")::bigint FROM project WHERE "deletedAt" IS NULL AND "buildStatus" = 'approved'
      UNION ALL
      SELECT 'qualified', COUNT(*)::bigint FROM (
        SELECT "userId" FROM currency_transaction GROUP BY "userId" HAVING SUM(amount) >= 350
      ) q
    `,

    // --- Bits Funnel ---
    prisma.$queryRaw<{ step: string; count: bigint }[]>`
      WITH balances AS (
        SELECT "userId", SUM(amount) as balance
        FROM currency_transaction
        GROUP BY "userId"
        HAVING SUM(amount) > 0
      )
      SELECT 'bits_1' as step, COUNT(*)::bigint as count FROM balances WHERE balance >= 1
      UNION ALL
      SELECT 'bits_100', COUNT(*)::bigint FROM balances WHERE balance >= 100
      UNION ALL
      SELECT 'bits_200', COUNT(*)::bigint FROM balances WHERE balance >= 200
      UNION ALL
      SELECT 'bits_300', COUNT(*)::bigint FROM balances WHERE balance >= 300
      UNION ALL
      SELECT 'bits_400', COUNT(*)::bigint FROM balances WHERE balance >= 400
    `,

    // --- Weekly Trends (last 12 weeks) ---
    prisma.$queryRaw<{ week: string; projects: bigint; reviews: bigint; bits: bigint; hours: number }[]>`
      WITH weeks AS (
        SELECT generate_series(
          DATE_TRUNC('week', NOW() - INTERVAL '11 weeks'),
          DATE_TRUNC('week', NOW()),
          '1 week'::interval
        ) AS week_start
      ),
      project_counts AS (
        SELECT DATE_TRUNC('week', "createdAt") AS week, COUNT(*)::bigint AS cnt
        FROM project
        WHERE "createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks') AND "deletedAt" IS NULL
        GROUP BY week
      ),
      review_counts AS (
        SELECT DATE_TRUNC('week', "createdAt") AS week, COUNT(*)::bigint AS cnt
        FROM project_review_action
        WHERE "createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks')
        GROUP BY week
      ),
      bits_counts AS (
        SELECT DATE_TRUNC('week', "createdAt") AS week, COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::bigint AS cnt
        FROM currency_transaction
        WHERE "createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks')
        GROUP BY week
      ),
      hours_counts AS (
        SELECT DATE_TRUNC('week', ws."createdAt") AS week, COALESCE(SUM(ws."hoursApproved"), 0)::float AS cnt
        FROM work_session ws
        JOIN project p ON ws."projectId" = p.id
        WHERE ws."createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks') AND p."deletedAt" IS NULL
        GROUP BY week
      )
      SELECT
        TO_CHAR(w.week_start, 'YYYY-MM-DD') AS week,
        COALESCE(p.cnt, 0)::bigint AS projects,
        COALESCE(r.cnt, 0)::bigint AS reviews,
        COALESCE(b.cnt, 0)::bigint AS bits,
        COALESCE(h.cnt, 0)::float AS hours
      FROM weeks w
      LEFT JOIN project_counts p ON p.week = w.week_start
      LEFT JOIN review_counts r ON r.week = w.week_start
      LEFT JOIN bits_counts b ON b.week = w.week_start
      LEFT JOIN hours_counts h ON h.week = w.week_start
      ORDER BY w.week_start
    `,

    // --- Review Turnaround (avg hours from submission to review) ---
    prisma.$queryRaw<{ avg_design_hours: number; avg_build_hours: number; median_design_hours: number; median_build_hours: number }[]>`
      WITH review_times AS (
        SELECT
          ps.stage,
          EXTRACT(EPOCH FROM (sr."createdAt" - ps."createdAt")) / 3600.0 AS hours_to_review
        FROM submission_review sr
        JOIN project_submission ps ON sr."submissionId" = ps.id
        WHERE sr."createdAt" IS NOT NULL AND ps."createdAt" IS NOT NULL
      )
      SELECT
        COALESCE(AVG(hours_to_review) FILTER (WHERE stage = 'DESIGN'), 0)::float AS avg_design_hours,
        COALESCE(AVG(hours_to_review) FILTER (WHERE stage = 'BUILD'), 0)::float AS avg_build_hours,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours_to_review) FILTER (WHERE stage = 'DESIGN'), 0)::float AS median_design_hours,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours_to_review) FILTER (WHERE stage = 'BUILD'), 0)::float AS median_build_hours
      FROM review_times
    `,

    // --- Balance Distribution (histogram) ---
    prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
      SELECT bucket, COUNT(*)::bigint as count FROM (
        SELECT
          CASE
            WHEN balance < 50 THEN '0-49'
            WHEN balance < 100 THEN '50-99'
            WHEN balance < 200 THEN '100-199'
            WHEN balance < 350 THEN '200-349'
            WHEN balance < 500 THEN '350-499'
            ELSE '500+'
          END AS bucket
        FROM (
          SELECT "userId", SUM(amount) AS balance
          FROM currency_transaction
          GROUP BY "userId"
          HAVING SUM(amount) > 0
        ) sub
      ) buckets
      GROUP BY bucket
      ORDER BY MIN(
        CASE bucket
          WHEN '0-49' THEN 1
          WHEN '50-99' THEN 2
          WHEN '100-199' THEN 3
          WHEN '200-349' THEN 4
          WHEN '350-499' THEN 5
          WHEN '500+' THEN 6
        END
      )
    `,

    // --- Project Pipeline (avg days between stages) ---
    prisma.$queryRaw<{ avg_to_design_review: number; avg_to_build_review: number; avg_total: number }[]>`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM ("designReviewedAt" - "createdAt")) / 86400.0) FILTER (WHERE "designReviewedAt" IS NOT NULL), 0)::float AS avg_to_design_review,
        COALESCE(AVG(EXTRACT(EPOCH FROM ("buildReviewedAt" - "designReviewedAt")) / 86400.0) FILTER (WHERE "buildReviewedAt" IS NOT NULL AND "designReviewedAt" IS NOT NULL), 0)::float AS avg_to_build_review,
        COALESCE(AVG(EXTRACT(EPOCH FROM ("buildReviewedAt" - "createdAt")) / 86400.0) FILTER (WHERE "buildReviewedAt" IS NOT NULL), 0)::float AS avg_total
      FROM project
      WHERE "deletedAt" IS NULL
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
      byTierDetailed: projectsByTierDetailed.map((r) => ({
        tier: r.tier?.toString() ?? 'untiered',
        approved: Number(r.approved),
        pending: Number(r.pending),
      })),
    },
    users: {
      total: userCount,
      withProjects: usersWithProjects,
      fraudFlagged: fraudCount,
      signupsByMonth: signupsByMonth.map((r) => ({
        month: r.month,
        count: Number(r.count),
      })),
      pronouns: Object.fromEntries(
        pronounsByCount.map((r) => [r.pronouns ?? 'Not set', Number(r.count)])
      ),
      goals: Object.fromEntries(
        goalByCount.map((r) => [r.goal ?? 'Not set', Number(r.count)])
      ),
    },
    time: {
      totalHoursClaimed: Math.round((timeAggregates._sum.hoursClaimed ?? 0) * 10) / 10,
      totalHoursApproved: Math.round((timeAggregates._sum.hoursApproved ?? 0) * 10) / 10,
      totalSessions: sessionCount,
      byCategory: categoryMap,
      bitsPerHour: (timeAggregates._sum.hoursApproved ?? 0) > 0
        ? Math.round((totalDistributed / (timeAggregates._sum.hoursApproved ?? 1)) * 10) / 10
        : null,
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
    funnel: funnelStats.map((r) => ({
      step: r.step,
      count: Number(r.count),
    })),
    bitsFunnel: bitsFunnelStats.map((r) => ({
      step: r.step,
      count: Number(r.count),
    })),
    weeklyTrends: weeklyTrends.map((r) => ({
      week: r.week,
      projects: Number(r.projects),
      reviews: Number(r.reviews),
      bits: Number(r.bits),
      hours: Math.round(r.hours * 10) / 10,
    })),
    reviewTurnaround: {
      avgDesignHours: Math.round((reviewTurnaround[0]?.avg_design_hours ?? 0) * 10) / 10,
      avgBuildHours: Math.round((reviewTurnaround[0]?.avg_build_hours ?? 0) * 10) / 10,
      medianDesignHours: Math.round((reviewTurnaround[0]?.median_design_hours ?? 0) * 10) / 10,
      medianBuildHours: Math.round((reviewTurnaround[0]?.median_build_hours ?? 0) * 10) / 10,
    },
    balanceDistribution: balanceDistribution.map((r) => ({
      bucket: r.bucket,
      count: Number(r.count),
    })),
    projectPipeline: {
      avgDaysToDesignReview: Math.round((projectPipeline[0]?.avg_to_design_review ?? 0) * 10) / 10,
      avgDaysToBuildReview: Math.round((projectPipeline[0]?.avg_to_build_review ?? 0) * 10) / 10,
      avgDaysTotal: Math.round((projectPipeline[0]?.avg_total ?? 0) * 10) / 10,
    },
  })
}
