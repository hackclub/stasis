import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const [
    queueSnapshot,
    dailyActivity,
    weeklyActivity,
    turnaroundFirstResponse,
    turnaroundResolution,
    turnaroundTrendRaw,
    outcomeData,
    reviewerRaw,
    backlogBuckets,
    oldestPendingRaw,
    periodCounts,
    agreementRaw,
    resubmitDesign,
    resubmitBuild,
    activityByDowRaw,
    activityByHourRaw,
    adminOutcomeData,
    adminTurnaround,
  ] = await Promise.all([
    // 0: Queue snapshot — pending/claimed/pre-reviewed by stage
    prisma.$queryRaw<[{
      design_pending: number; build_pending: number;
      design_claimed: number; build_claimed: number;
      design_pre_reviewed: number; build_pre_reviewed: number;
    }]>`
      WITH latest_design_subs AS (
        SELECT DISTINCT ON (ps."projectId")
          ps.id, ps."projectId", ps."preReviewed"
        FROM project_submission ps
        JOIN project p ON p.id = ps."projectId"
        WHERE p."deletedAt" IS NULL AND p."designStatus" = 'in_review' AND ps.stage = 'DESIGN'
        ORDER BY ps."projectId", ps."createdAt" DESC
      ),
      latest_build_subs AS (
        SELECT DISTINCT ON (ps."projectId")
          ps.id, ps."projectId", ps."preReviewed"
        FROM project_submission ps
        JOIN project p ON p.id = ps."projectId"
        WHERE p."deletedAt" IS NULL AND p."buildStatus" = 'in_review' AND ps.stage = 'BUILD'
        ORDER BY ps."projectId", ps."createdAt" DESC
      )
      SELECT
        (SELECT COUNT(*)::int FROM project WHERE "deletedAt" IS NULL AND "designStatus" = 'in_review') as design_pending,
        (SELECT COUNT(*)::int FROM project WHERE "deletedAt" IS NULL AND "buildStatus" = 'in_review') as build_pending,
        (SELECT COUNT(*)::int FROM latest_design_subs lds JOIN review_claim rc ON rc."submissionId" = lds.id AND rc."expiresAt" > NOW()) as design_claimed,
        (SELECT COUNT(*)::int FROM latest_build_subs lbs JOIN review_claim rc ON rc."submissionId" = lbs.id AND rc."expiresAt" > NOW()) as build_claimed,
        (SELECT COUNT(*)::int FROM latest_design_subs WHERE "preReviewed" = true) as design_pre_reviewed,
        (SELECT COUNT(*)::int FROM latest_build_subs WHERE "preReviewed" = true) as build_pre_reviewed
    `,

    // 1: Daily activity (last 30 days)
    prisma.$queryRaw<{ date: string; submissions: number; reviews: number }[]>`
      WITH days AS (
        SELECT generate_series(
          DATE_TRUNC('day', NOW() - INTERVAL '29 days'),
          DATE_TRUNC('day', NOW()),
          '1 day'::interval
        ) AS day
      ),
      daily_subs AS (
        SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::int AS cnt
        FROM project_submission
        WHERE "createdAt" >= DATE_TRUNC('day', NOW() - INTERVAL '29 days')
        GROUP BY 1
      ),
      daily_revs AS (
        SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::int AS cnt
        FROM submission_review
        WHERE "createdAt" >= DATE_TRUNC('day', NOW() - INTERVAL '29 days') AND invalidated = false
        GROUP BY 1
      )
      SELECT
        TO_CHAR(d.day, 'YYYY-MM-DD') as date,
        COALESCE(s.cnt, 0)::int as submissions,
        COALESCE(r.cnt, 0)::int as reviews
      FROM days d
      LEFT JOIN daily_subs s ON s.day = d.day
      LEFT JOIN daily_revs r ON r.day = d.day
      ORDER BY d.day
    `,

    // 2: Weekly activity (last 12 weeks)
    prisma.$queryRaw<{ week: string; submissions: number; reviews: number }[]>`
      WITH weeks AS (
        SELECT generate_series(
          DATE_TRUNC('week', NOW() - INTERVAL '11 weeks'),
          DATE_TRUNC('week', NOW()),
          '1 week'::interval
        ) AS week_start
      ),
      weekly_subs AS (
        SELECT DATE_TRUNC('week', "createdAt") AS week, COUNT(*)::int AS cnt
        FROM project_submission
        WHERE "createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks')
        GROUP BY 1
      ),
      weekly_revs AS (
        SELECT DATE_TRUNC('week', "createdAt") AS week, COUNT(*)::int AS cnt
        FROM submission_review
        WHERE "createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks') AND invalidated = false
        GROUP BY 1
      )
      SELECT
        TO_CHAR(w.week_start, 'YYYY-MM-DD') as week,
        COALESCE(s.cnt, 0)::int as submissions,
        COALESCE(r.cnt, 0)::int as reviews
      FROM weeks w
      LEFT JOIN weekly_subs s ON s.week = w.week_start
      LEFT JOIN weekly_revs r ON r.week = w.week_start
      ORDER BY w.week_start
    `,

    // 3: Turnaround — first response (time to any review)
    prisma.$queryRaw<{ stage: string; avg_hours: number; median_hours: number; p90_hours: number; sample_count: number }[]>`
      WITH first_reviews AS (
        SELECT
          ps.stage::text as stage,
          MIN(sr."createdAt") as review_at,
          ps."createdAt" as sub_created
        FROM project_submission ps
        JOIN submission_review sr ON sr."submissionId" = ps.id AND sr.invalidated = false
        GROUP BY ps.id, ps.stage, ps."createdAt"
      )
      SELECT
        stage,
        COALESCE(AVG(EXTRACT(EPOCH FROM (review_at - sub_created)) / 3600.0), 0)::float as avg_hours,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (review_at - sub_created)) / 3600.0), 0)::float as median_hours,
        COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (review_at - sub_created)) / 3600.0), 0)::float as p90_hours,
        COUNT(*)::int as sample_count
      FROM first_reviews
      GROUP BY stage
    `,

    // 4: Turnaround — resolution (time to admin review)
    prisma.$queryRaw<{ stage: string; avg_hours: number; median_hours: number; p90_hours: number; sample_count: number }[]>`
      WITH admin_reviews AS (
        SELECT
          ps.stage::text as stage,
          MIN(sr."createdAt") as review_at,
          ps."createdAt" as sub_created
        FROM project_submission ps
        JOIN submission_review sr ON sr."submissionId" = ps.id AND sr."isAdminReview" = true AND sr.invalidated = false
        GROUP BY ps.id, ps.stage, ps."createdAt"
      )
      SELECT
        stage,
        COALESCE(AVG(EXTRACT(EPOCH FROM (review_at - sub_created)) / 3600.0), 0)::float as avg_hours,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (review_at - sub_created)) / 3600.0), 0)::float as median_hours,
        COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (review_at - sub_created)) / 3600.0), 0)::float as p90_hours,
        COUNT(*)::int as sample_count
      FROM admin_reviews
      GROUP BY stage
    `,

    // 5: Turnaround trend (median first-response per week, last 12 weeks)
    prisma.$queryRaw<{ week: string; stage: string; median_hours: number; review_count: number }[]>`
      WITH first_reviews AS (
        SELECT
          ps.stage::text as stage,
          MIN(sr."createdAt") as review_at,
          ps."createdAt" as sub_created
        FROM project_submission ps
        JOIN submission_review sr ON sr."submissionId" = ps.id AND sr.invalidated = false
        GROUP BY ps.id, ps.stage, ps."createdAt"
      )
      SELECT
        TO_CHAR(DATE_TRUNC('week', review_at), 'YYYY-MM-DD') as week,
        stage,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (review_at - sub_created)) / 3600.0
        )::float as median_hours,
        COUNT(*)::int as review_count
      FROM first_reviews
      WHERE review_at >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks')
      GROUP BY DATE_TRUNC('week', review_at), stage
      ORDER BY week, stage
    `,

    // 6: Outcomes by stage + result
    prisma.$queryRaw<{ stage: string; result: string; count: number }[]>`
      SELECT
        ps.stage::text as stage,
        sr.result::text as result,
        COUNT(*)::int as count
      FROM submission_review sr
      JOIN project_submission ps ON sr."submissionId" = ps.id
      WHERE sr.invalidated = false
      GROUP BY ps.stage, sr.result
    `,

    // 7: Per-reviewer stats
    prisma.$queryRaw<{
      reviewer_id: string; total: number; first_pass: number; admin: number;
      approved: number; returned: number; rejected: number;
      today: number; this_week: number; this_month: number;
      avg_turnaround_hours: number; active_days: number;
    }[]>`
      SELECT
        sr."reviewerId" as reviewer_id,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sr."isAdminReview" = false)::int as first_pass,
        COUNT(*) FILTER (WHERE sr."isAdminReview" = true)::int as admin,
        COUNT(*) FILTER (WHERE sr.result = 'APPROVED')::int as approved,
        COUNT(*) FILTER (WHERE sr.result = 'RETURNED')::int as returned,
        COUNT(*) FILTER (WHERE sr.result = 'REJECTED')::int as rejected,
        COUNT(*) FILTER (WHERE sr."createdAt" >= DATE_TRUNC('day', NOW()))::int as today,
        COUNT(*) FILTER (WHERE sr."createdAt" >= DATE_TRUNC('week', NOW()))::int as this_week,
        COUNT(*) FILTER (WHERE sr."createdAt" >= DATE_TRUNC('month', NOW()))::int as this_month,
        COALESCE(AVG(EXTRACT(EPOCH FROM (sr."createdAt" - ps."createdAt")) / 3600.0), 0)::float as avg_turnaround_hours,
        COUNT(DISTINCT DATE_TRUNC('day', sr."createdAt"))::int as active_days
      FROM submission_review sr
      JOIN project_submission ps ON sr."submissionId" = ps.id
      WHERE sr.invalidated = false
      GROUP BY sr."reviewerId"
      ORDER BY total DESC
    `,

    // 8: Backlog age distribution
    prisma.$queryRaw<{ bucket: string; count: number }[]>`
      WITH pending_sub_ages AS (
        SELECT DISTINCT ON (ps."projectId", ps.stage)
          EXTRACT(EPOCH FROM (NOW() - ps."createdAt")) / 3600.0 as age_hours
        FROM project_submission ps
        JOIN project p ON p.id = ps."projectId"
        WHERE p."deletedAt" IS NULL
          AND (
            (ps.stage = 'DESIGN' AND p."designStatus" = 'in_review')
            OR (ps.stage = 'BUILD' AND p."buildStatus" = 'in_review')
          )
        ORDER BY ps."projectId", ps.stage, ps."createdAt" DESC
      )
      SELECT
        CASE
          WHEN age_hours < 24 THEN '< 1 day'
          WHEN age_hours < 72 THEN '1-3 days'
          WHEN age_hours < 168 THEN '3-7 days'
          WHEN age_hours < 336 THEN '1-2 weeks'
          ELSE '2+ weeks'
        END as bucket,
        COUNT(*)::int as count
      FROM pending_sub_ages
      GROUP BY bucket
      ORDER BY MIN(age_hours)
    `,

    // 9: Oldest 10 pending submissions
    prisma.$queryRaw<{
      id: string; project_id: string; project_title: string; stage: string;
      submitted_at: Date; age_hours: number; pre_reviewed: boolean; claimed_by: string | null;
    }[]>`
      WITH latest_subs AS (
        SELECT DISTINCT ON (ps."projectId", ps.stage)
          ps.id,
          ps."projectId" as project_id,
          p.title as project_title,
          ps.stage::text as stage,
          ps."createdAt" as submitted_at,
          EXTRACT(EPOCH FROM (NOW() - ps."createdAt")) / 3600.0 as age_hours,
          ps."preReviewed" as pre_reviewed,
          rc."reviewerId" as claimed_by
        FROM project_submission ps
        JOIN project p ON p.id = ps."projectId"
        LEFT JOIN review_claim rc ON rc."submissionId" = ps.id AND rc."expiresAt" > NOW()
        WHERE p."deletedAt" IS NULL
          AND (
            (ps.stage = 'DESIGN' AND p."designStatus" = 'in_review')
            OR (ps.stage = 'BUILD' AND p."buildStatus" = 'in_review')
          )
        ORDER BY ps."projectId", ps.stage, ps."createdAt" DESC
      )
      SELECT * FROM latest_subs
      ORDER BY submitted_at ASC
      LIMIT 10
    `,

    // 10: Period summaries (today / week / month / all-time)
    prisma.$queryRaw<[{
      subs_today: number; revs_today: number;
      subs_week: number; revs_week: number;
      subs_month: number; revs_month: number;
      subs_all: number; revs_all: number;
    }]>`
      SELECT
        (SELECT COUNT(*)::int FROM project_submission WHERE "createdAt" >= DATE_TRUNC('day', NOW())) as subs_today,
        (SELECT COUNT(*)::int FROM submission_review WHERE "createdAt" >= DATE_TRUNC('day', NOW()) AND invalidated = false) as revs_today,
        (SELECT COUNT(*)::int FROM project_submission WHERE "createdAt" >= DATE_TRUNC('week', NOW())) as subs_week,
        (SELECT COUNT(*)::int FROM submission_review WHERE "createdAt" >= DATE_TRUNC('week', NOW()) AND invalidated = false) as revs_week,
        (SELECT COUNT(*)::int FROM project_submission WHERE "createdAt" >= DATE_TRUNC('month', NOW())) as subs_month,
        (SELECT COUNT(*)::int FROM submission_review WHERE "createdAt" >= DATE_TRUNC('month', NOW()) AND invalidated = false) as revs_month,
        (SELECT COUNT(*)::int FROM project_submission) as subs_all,
        (SELECT COUNT(*)::int FROM submission_review WHERE invalidated = false) as revs_all
    `,

    // 11: First-pass vs admin agreement matrix
    prisma.$queryRaw<{ first_pass_result: string; admin_result: string; count: number }[]>`
      WITH paired AS (
        SELECT
          fp.result::text as first_pass_result,
          ap.result::text as admin_result
        FROM submission_review fp
        JOIN submission_review ap ON ap."submissionId" = fp."submissionId"
          AND ap."isAdminReview" = true AND ap.invalidated = false
        WHERE fp."isAdminReview" = false AND fp.invalidated = false
      )
      SELECT first_pass_result, admin_result, COUNT(*)::int as count
      FROM paired
      GROUP BY first_pass_result, admin_result
      ORDER BY first_pass_result, admin_result
    `,

    // 12: Resubmission distribution — design
    prisma.$queryRaw<[{ avg_submissions: number; one: number; two: number; three: number; four_plus: number }]>`
      WITH sub_counts AS (
        SELECT "projectId", COUNT(*)::int as cnt
        FROM project_submission WHERE stage = 'DESIGN'
        GROUP BY "projectId"
      )
      SELECT
        COALESCE(AVG(cnt), 0)::float as avg_submissions,
        COUNT(*) FILTER (WHERE cnt = 1)::int as one,
        COUNT(*) FILTER (WHERE cnt = 2)::int as two,
        COUNT(*) FILTER (WHERE cnt = 3)::int as three,
        COUNT(*) FILTER (WHERE cnt >= 4)::int as four_plus
      FROM sub_counts
    `,

    // 13: Resubmission distribution — build
    prisma.$queryRaw<[{ avg_submissions: number; one: number; two: number; three: number; four_plus: number }]>`
      WITH sub_counts AS (
        SELECT "projectId", COUNT(*)::int as cnt
        FROM project_submission WHERE stage = 'BUILD'
        GROUP BY "projectId"
      )
      SELECT
        COALESCE(AVG(cnt), 0)::float as avg_submissions,
        COUNT(*) FILTER (WHERE cnt = 1)::int as one,
        COUNT(*) FILTER (WHERE cnt = 2)::int as two,
        COUNT(*) FILTER (WHERE cnt = 3)::int as three,
        COUNT(*) FILTER (WHERE cnt >= 4)::int as four_plus
      FROM sub_counts
    `,

    // 14: Activity by day of week
    prisma.$queryRaw<{ dow: number; type: string; count: number }[]>`
      SELECT EXTRACT(DOW FROM "createdAt")::int as dow, 'submission' as type, COUNT(*)::int as count
      FROM project_submission GROUP BY 1
      UNION ALL
      SELECT EXTRACT(DOW FROM "createdAt")::int as dow, 'review' as type, COUNT(*)::int as count
      FROM submission_review WHERE invalidated = false GROUP BY 1
      ORDER BY dow, type
    `,

    // 15: Activity by hour of day
    prisma.$queryRaw<{ hour: number; type: string; count: number }[]>`
      SELECT EXTRACT(HOUR FROM "createdAt")::int as hour, 'submission' as type, COUNT(*)::int as count
      FROM project_submission GROUP BY 1
      UNION ALL
      SELECT EXTRACT(HOUR FROM "createdAt")::int as hour, 'review' as type, COUNT(*)::int as count
      FROM submission_review WHERE invalidated = false GROUP BY 1
      ORDER BY hour, type
    `,

    // 16: Admin outcomes (from project_review_action — the canonical admin decision table)
    prisma.$queryRaw<{ stage: string; decision: string; count: number }[]>`
      SELECT stage::text as stage, decision::text as decision, COUNT(*)::int as count
      FROM project_review_action
      GROUP BY stage, decision
      ORDER BY stage, decision
    `,

    // 17: Admin review turnaround (project_review_action.createdAt vs project.createdAt for that stage)
    prisma.$queryRaw<{ stage: string; avg_hours: number; median_hours: number; p90_hours: number; sample_count: number }[]>`
      WITH action_times AS (
        SELECT
          pra.stage::text as stage,
          EXTRACT(EPOCH FROM (pra."createdAt" - ps."createdAt")) / 3600.0 as hours
        FROM project_review_action pra
        JOIN project p ON p.id = pra."projectId"
        JOIN LATERAL (
          SELECT ps2."createdAt"
          FROM project_submission ps2
          WHERE ps2."projectId" = pra."projectId" AND ps2.stage = pra.stage AND ps2."createdAt" <= pra."createdAt"
          ORDER BY ps2."createdAt" DESC LIMIT 1
        ) ps ON true
        WHERE p."deletedAt" IS NULL
      )
      SELECT
        stage,
        COALESCE(AVG(hours), 0)::float as avg_hours,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours), 0)::float as median_hours,
        COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY hours), 0)::float as p90_hours,
        COUNT(*)::int as sample_count
      FROM action_times
      WHERE hours >= 0
      GROUP BY stage
    `,
  ])

  // Fetch reviewer and claimer user info
  const reviewerIds = reviewerRaw.map(r => r.reviewer_id)
  const claimerIds = oldestPendingRaw.map(r => r.claimed_by).filter(Boolean) as string[]
  const allUserIds = [...new Set([...reviewerIds, ...claimerIds])]

  const users = allUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, name: true, slackDisplayName: true, image: true },
      })
    : []
  const userMap = new Map(users.map(u => [u.id, { name: u.slackDisplayName || u.name, image: u.image }]))

  // Format turnaround data
  const formatTurnaround = (rows: typeof turnaroundFirstResponse) => {
    const design = rows.find(r => r.stage === "DESIGN")
    const build = rows.find(r => r.stage === "BUILD")
    const fmt = (r: typeof design) => ({
      avg: Math.round((r?.avg_hours ?? 0) * 10) / 10,
      median: Math.round((r?.median_hours ?? 0) * 10) / 10,
      p90: Math.round((r?.p90_hours ?? 0) * 10) / 10,
      sampleCount: r?.sample_count ?? 0,
    })
    return { design: fmt(design), build: fmt(build) }
  }

  // Format turnaround trend
  const turnaroundTrend = turnaroundTrendRaw.reduce<Record<string, { week: string; designMedian: number; buildMedian: number }>>((acc, r) => {
    if (!acc[r.week]) acc[r.week] = { week: r.week, designMedian: 0, buildMedian: 0 }
    if (r.stage === "DESIGN") acc[r.week].designMedian = Math.round(r.median_hours * 10) / 10
    if (r.stage === "BUILD") acc[r.week].buildMedian = Math.round(r.median_hours * 10) / 10
    return acc
  }, {})

  // Format outcomes (first-pass from submission_review)
  const outcomes: Record<string, Record<string, number>> = { DESIGN: {}, BUILD: {} }
  for (const r of outcomeData) {
    if (!outcomes[r.stage]) outcomes[r.stage] = {}
    outcomes[r.stage][r.result] = r.count
  }

  // Format admin outcomes (from project_review_action)
  const adminOutcomes: Record<string, Record<string, number>> = { DESIGN: {}, BUILD: {} }
  for (const r of adminOutcomeData) {
    if (!adminOutcomes[r.stage]) adminOutcomes[r.stage] = {}
    adminOutcomes[r.stage][r.decision] = r.count
  }

  // Format agreement matrix
  const agreementTotal = agreementRaw.reduce((s, r) => s + r.count, 0)
  const agreementMatches = agreementRaw.filter(r => r.first_pass_result === r.admin_result).reduce((s, r) => s + r.count, 0)

  // Format activity by DOW
  const dowMap: Record<number, { submissions: number; reviews: number }> = {}
  for (let i = 0; i < 7; i++) dowMap[i] = { submissions: 0, reviews: 0 }
  for (const r of activityByDowRaw) {
    if (!dowMap[r.dow]) dowMap[r.dow] = { submissions: 0, reviews: 0 }
    if (r.type === "submission") dowMap[r.dow].submissions = r.count
    else dowMap[r.dow].reviews = r.count
  }

  // Format activity by hour
  const hourMap: Record<number, { submissions: number; reviews: number }> = {}
  for (let i = 0; i < 24; i++) hourMap[i] = { submissions: 0, reviews: 0 }
  for (const r of activityByHourRaw) {
    if (!hourMap[r.hour]) hourMap[r.hour] = { submissions: 0, reviews: 0 }
    if (r.type === "submission") hourMap[r.hour].submissions = r.count
    else hourMap[r.hour].reviews = r.count
  }

  const q = queueSnapshot[0]
  const p = periodCounts[0]
  const rd = resubmitDesign[0] ?? { avg_submissions: 0, one: 0, two: 0, three: 0, four_plus: 0 }
  const rb = resubmitBuild[0] ?? { avg_submissions: 0, one: 0, two: 0, three: 0, four_plus: 0 }

  return NextResponse.json({
    queue: {
      design: { pending: q.design_pending, claimed: q.design_claimed, preReviewed: q.design_pre_reviewed },
      build: { pending: q.build_pending, claimed: q.build_claimed, preReviewed: q.build_pre_reviewed },
    },
    periods: {
      today: { submissions: p.subs_today, reviews: p.revs_today },
      thisWeek: { submissions: p.subs_week, reviews: p.revs_week },
      thisMonth: { submissions: p.subs_month, reviews: p.revs_month },
      allTime: { submissions: p.subs_all, reviews: p.revs_all },
    },
    dailyActivity,
    weeklyActivity,
    turnaround: {
      firstResponse: formatTurnaround(turnaroundFirstResponse),
      resolution: formatTurnaround(turnaroundResolution),
    },
    turnaroundTrend: Object.values(turnaroundTrend).sort((a, b) => a.week.localeCompare(b.week)),
    outcomes: {
      design: { approved: outcomes.DESIGN?.APPROVED ?? 0, returned: outcomes.DESIGN?.RETURNED ?? 0, rejected: outcomes.DESIGN?.REJECTED ?? 0 },
      build: { approved: outcomes.BUILD?.APPROVED ?? 0, returned: outcomes.BUILD?.RETURNED ?? 0, rejected: outcomes.BUILD?.REJECTED ?? 0 },
    },
    reviewers: reviewerRaw.map(r => ({
      id: r.reviewer_id,
      name: userMap.get(r.reviewer_id)?.name ?? "Unknown",
      image: userMap.get(r.reviewer_id)?.image ?? null,
      total: r.total,
      firstPass: r.first_pass,
      admin: r.admin,
      approved: r.approved,
      returned: r.returned,
      rejected: r.rejected,
      today: r.today,
      week: r.this_week,
      month: r.this_month,
      avgTurnaroundHours: Math.round(r.avg_turnaround_hours * 10) / 10,
      activeDays: r.active_days,
    })),
    backlog: {
      buckets: backlogBuckets,
      oldest: oldestPendingRaw.map(r => ({
        id: r.id,
        projectId: r.project_id,
        projectTitle: r.project_title,
        stage: r.stage,
        submittedAt: r.submitted_at,
        ageHours: Math.round(r.age_hours * 10) / 10,
        preReviewed: r.pre_reviewed,
        claimedBy: r.claimed_by,
        claimerName: r.claimed_by ? userMap.get(r.claimed_by)?.name ?? null : null,
      })),
    },
    agreement: {
      matrix: agreementRaw.map(r => ({ firstPass: r.first_pass_result, admin: r.admin_result, count: r.count })),
      agreementRate: agreementTotal > 0 ? Math.round((agreementMatches / agreementTotal) * 1000) / 10 : 0,
      total: agreementTotal,
    },
    resubmissions: {
      design: { avg: Math.round(rd.avg_submissions * 10) / 10, distribution: [
        { submissions: 1, projects: rd.one },
        { submissions: 2, projects: rd.two },
        { submissions: 3, projects: rd.three },
        { submissions: "4+", projects: rd.four_plus },
      ]},
      build: { avg: Math.round(rb.avg_submissions * 10) / 10, distribution: [
        { submissions: 1, projects: rb.one },
        { submissions: 2, projects: rb.two },
        { submissions: 3, projects: rb.three },
        { submissions: "4+", projects: rb.four_plus },
      ]},
    },
    activityByDow: Object.entries(dowMap).map(([dow, data]) => ({ dow: Number(dow), ...data })),
    activityByHour: Object.entries(hourMap).map(([hour, data]) => ({ hour: Number(hour), ...data })),
    adminOutcomes: {
      design: {
        approved: adminOutcomes.DESIGN?.APPROVED ?? 0,
        returned: adminOutcomes.DESIGN?.CHANGE_REQUESTED ?? 0,
        rejected: adminOutcomes.DESIGN?.REJECTED ?? 0,
      },
      build: {
        approved: adminOutcomes.BUILD?.APPROVED ?? 0,
        returned: adminOutcomes.BUILD?.CHANGE_REQUESTED ?? 0,
        rejected: adminOutcomes.BUILD?.REJECTED ?? 0,
      },
    },
    adminTurnaround: formatTurnaround(adminTurnaround),
  })
}
