import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

export async function GET() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const [
    queueStats,
    dailyActivity,
    weeklyStats,
    turnaroundTrend,
    turnaroundByStage,
    reviewFreshness,
    backlogAge,
    oldestPendingRaw,
    adminOutcomes,
    resubmitStats,
    queueHistoryRaw,
    reviewerRaw,
    periodCounts,
    waitDistRaw,
  ] = await Promise.all([
    // 0: Queue snapshot — pending counts + wait time percentiles
    prisma.$queryRaw<[{
      total: number; design: number; build: number; pre_reviewed: number;
      median_wait_days: number; p90_wait_days: number; max_wait_days: number;
    }]>`
      WITH pending AS (
        SELECT DISTINCT ON (ps."projectId", ps.stage)
          ps."createdAt", ps.stage::text as stage, ps."preReviewed",
          EXTRACT(EPOCH FROM (NOW() - ps."createdAt")) / 86400.0 as age_days
        FROM project_submission ps
        JOIN project p ON p.id = ps."projectId"
        JOIN "user" u ON u.id = p."userId"
        WHERE p."deletedAt" IS NULL
          AND u."fraudConvicted" = false
          AND ((ps.stage = 'DESIGN' AND p."designStatus" = 'in_review')
            OR (ps.stage = 'BUILD' AND p."buildStatus" = 'in_review'))
        ORDER BY ps."projectId", ps.stage, ps."createdAt" DESC
      )
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE stage = 'DESIGN')::int as design,
        COUNT(*) FILTER (WHERE stage = 'BUILD')::int as build,
        COUNT(*) FILTER (WHERE "preReviewed" = true)::int as pre_reviewed,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days), 0)::float as median_wait_days,
        COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY age_days), 0)::float as p90_wait_days,
        COALESCE(MAX(age_days), 0)::float as max_wait_days
      FROM pending
    `,

    // 1: Daily activity by stage (60 days, combined reviews from both tables)
    prisma.$queryRaw<{
      date: string; design_subs: number; build_subs: number; design_decisions: number; build_decisions: number;
    }[]>`
      WITH days AS (
        SELECT generate_series(DATE_TRUNC('day', NOW() - INTERVAL '59 days'), DATE_TRUNC('day', NOW()), '1 day'::interval) AS day
      ),
      ds AS (SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::int AS cnt FROM project_submission WHERE "createdAt" >= DATE_TRUNC('day', NOW() - INTERVAL '59 days') AND stage = 'DESIGN' GROUP BY 1),
      bs AS (SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::int AS cnt FROM project_submission WHERE "createdAt" >= DATE_TRUNC('day', NOW() - INTERVAL '59 days') AND stage = 'BUILD' GROUP BY 1),
      dr AS (
        SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::int AS cnt
        FROM project_review_action WHERE "createdAt" >= DATE_TRUNC('day', NOW() - INTERVAL '59 days') AND stage = 'DESIGN' GROUP BY 1
      ),
      br AS (
        SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::int AS cnt
        FROM project_review_action WHERE "createdAt" >= DATE_TRUNC('day', NOW() - INTERVAL '59 days') AND stage = 'BUILD' GROUP BY 1
      )
      SELECT TO_CHAR(d.day, 'YYYY-MM-DD') as date,
        COALESCE(ds.cnt, 0)::int as design_subs, COALESCE(bs.cnt, 0)::int as build_subs,
        COALESCE(dr.cnt, 0)::int as design_decisions, COALESCE(br.cnt, 0)::int as build_decisions
      FROM days d LEFT JOIN ds ON ds.day = d.day LEFT JOIN bs ON bs.day = d.day LEFT JOIN dr ON dr.day = d.day LEFT JOIN br ON br.day = d.day
      ORDER BY d.day
    `,

    // 2: Weekly stats (12 weeks — submissions, reviews, return rate, active reviewers)
    prisma.$queryRaw<{
      week: string; submissions: number; design_subs: number; build_subs: number; reviews: number;
      returned: number; admin_reviews: number; design_admin: number; build_admin: number;
      return_rate: number; active_reviewers: number;
    }[]>`
      WITH weeks AS (
        SELECT generate_series(DATE_TRUNC('week', NOW() - INTERVAL '11 weeks'), DATE_TRUNC('week', NOW()), '1 week'::interval) AS w
      ),
      ws AS (
        SELECT DATE_TRUNC('week', "createdAt") AS w, COUNT(*)::int AS cnt,
          COUNT(*) FILTER (WHERE stage = 'DESIGN')::int AS design_cnt,
          COUNT(*) FILTER (WHERE stage = 'BUILD')::int AS build_cnt
        FROM project_submission WHERE "createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks') GROUP BY 1
      ),
      wpra AS (
        SELECT DATE_TRUNC('week', "createdAt") AS w,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE stage = 'DESIGN')::int AS design_total,
          COUNT(*) FILTER (WHERE stage = 'BUILD')::int AS build_total,
          COUNT(*) FILTER (WHERE decision = 'CHANGE_REQUESTED')::int AS returned,
          COUNT(DISTINCT "reviewerId")::int AS active_reviewers
        FROM project_review_action WHERE "createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks') GROUP BY 1
      ),
      wsr AS (SELECT DATE_TRUNC('week', "createdAt") AS w, COUNT(*)::int AS cnt FROM submission_review WHERE "createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks') AND invalidated = false GROUP BY 1)
      SELECT TO_CHAR(weeks.w, 'YYYY-MM-DD') as week,
        COALESCE(ws.cnt, 0)::int as submissions,
        COALESCE(ws.design_cnt, 0)::int as design_subs,
        COALESCE(ws.build_cnt, 0)::int as build_subs,
        (COALESCE(wpra.total, 0) + COALESCE(wsr.cnt, 0))::int as reviews,
        COALESCE(wpra.returned, 0)::int as returned,
        COALESCE(wpra.total, 0)::int as admin_reviews,
        COALESCE(wpra.design_total, 0)::int as design_admin,
        COALESCE(wpra.build_total, 0)::int as build_admin,
        CASE WHEN COALESCE(wpra.total, 0) > 0 THEN ROUND((wpra.returned::float / wpra.total * 100)::numeric, 1)::float ELSE 0 END as return_rate,
        COALESCE(wpra.active_reviewers, 0)::int as active_reviewers
      FROM weeks LEFT JOIN ws ON ws.w = weeks.w LEFT JOIN wpra ON wpra.w = weeks.w LEFT JOIN wsr ON wsr.w = weeks.w
      ORDER BY weeks.w
    `,

    // 3: Turnaround trend — median + p90 days by stage, per week
    prisma.$queryRaw<{ week: string; stage: string; median_days: number; p90_days: number; count: number }[]>`
      WITH action_times AS (
        SELECT DATE_TRUNC('week', pra."createdAt") AS week, pra.stage::text as stage,
          EXTRACT(EPOCH FROM (pra."createdAt" - ps."createdAt")) / 86400.0 as days
        FROM project_review_action pra
        JOIN LATERAL (
          SELECT ps2."createdAt" FROM project_submission ps2
          WHERE ps2."projectId" = pra."projectId" AND ps2.stage = pra.stage AND ps2."createdAt" <= pra."createdAt"
          ORDER BY ps2."createdAt" DESC LIMIT 1
        ) ps ON true
        WHERE pra."createdAt" >= DATE_TRUNC('week', NOW() - INTERVAL '11 weeks')
      )
      SELECT TO_CHAR(week, 'YYYY-MM-DD') as week, stage,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days)::float as median_days,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY days)::float as p90_days,
        COUNT(*)::int as count
      FROM action_times WHERE days >= 0
      GROUP BY week, stage ORDER BY week, stage
    `,

    // 4: Turnaround by stage (overall median + p90)
    prisma.$queryRaw<{ stage: string; median_hours: number; p90_hours: number; sample_count: number }[]>`
      WITH action_times AS (
        SELECT pra.stage::text as stage,
          EXTRACT(EPOCH FROM (pra."createdAt" - ps."createdAt")) / 3600.0 as hours
        FROM project_review_action pra
        JOIN LATERAL (
          SELECT ps2."createdAt" FROM project_submission ps2
          WHERE ps2."projectId" = pra."projectId" AND ps2.stage = pra.stage AND ps2."createdAt" <= pra."createdAt"
          ORDER BY ps2."createdAt" DESC LIMIT 1
        ) ps ON true
        JOIN project p ON p.id = pra."projectId" WHERE p."deletedAt" IS NULL
      )
      SELECT stage,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours), 0)::float as median_hours,
        COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY hours), 0)::float as p90_hours,
        COUNT(*)::int as sample_count
      FROM action_times WHERE hours >= 0 GROUP BY stage
    `,

    // 5: Review freshness — how old were items when reviewed? (last 30 days)
    prisma.$queryRaw<{ bucket: string; count: number; median_age: number }[]>`
      WITH review_ages AS (
        SELECT EXTRACT(EPOCH FROM (pra."createdAt" - ps."createdAt")) / 86400.0 as age_days
        FROM project_review_action pra
        JOIN LATERAL (
          SELECT ps2."createdAt" FROM project_submission ps2
          WHERE ps2."projectId" = pra."projectId" AND ps2.stage = pra.stage AND ps2."createdAt" <= pra."createdAt"
          ORDER BY ps2."createdAt" DESC LIMIT 1
        ) ps ON true
        WHERE pra."createdAt" >= NOW() - INTERVAL '30 days'
      )
      SELECT bucket, COUNT(*)::int as count, ROUND(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days), 0)::numeric, 1)::float as median_age
      FROM (
        SELECT age_days,
          CASE
            WHEN age_days < 1 THEN '< 1 day'
            WHEN age_days < 3 THEN '1-3 days'
            WHEN age_days < 7 THEN '3-7 days'
            WHEN age_days < 14 THEN '1-2 weeks'
            ELSE '2+ weeks'
          END as bucket
        FROM review_ages WHERE age_days >= 0
      ) bucketed
      GROUP BY bucket ORDER BY MIN(age_days)
    `,

    // 6: Backlog age distribution by stage (current pending items)
    prisma.$queryRaw<{ stage: string; bucket: string; count: number }[]>`
      WITH pending AS (
        SELECT DISTINCT ON (ps."projectId", ps.stage)
          EXTRACT(EPOCH FROM (NOW() - ps."createdAt")) / 86400.0 as age_days,
          ps.stage::text as stage
        FROM project_submission ps
        JOIN project p ON p.id = ps."projectId"
        JOIN "user" u ON u.id = p."userId"
        WHERE p."deletedAt" IS NULL
          AND u."fraudConvicted" = false
          AND ((ps.stage = 'DESIGN' AND p."designStatus" = 'in_review')
            OR (ps.stage = 'BUILD' AND p."buildStatus" = 'in_review'))
        ORDER BY ps."projectId", ps.stage, ps."createdAt" DESC
      )
      SELECT stage,
        CASE
          WHEN age_days < 1 THEN '< 1 day'
          WHEN age_days < 3 THEN '1-3 days'
          WHEN age_days < 7 THEN '3-7 days'
          WHEN age_days < 14 THEN '1-2 weeks'
          WHEN age_days < 30 THEN '2-4 weeks'
          ELSE '1+ months'
        END as bucket,
        COUNT(*)::int as count
      FROM pending GROUP BY stage, bucket ORDER BY stage, MIN(age_days)
    `,

    // 7: Oldest 10 pending submissions
    prisma.$queryRaw<{
      id: string; project_id: string; project_title: string; stage: string;
      submitted_at: Date; age_days: number; pre_reviewed: boolean;
    }[]>`
      WITH latest_subs AS (
        SELECT DISTINCT ON (ps."projectId", ps.stage)
          ps.id, ps."projectId" as project_id, p.title as project_title,
          ps.stage::text as stage, ps."createdAt" as submitted_at,
          EXTRACT(EPOCH FROM (NOW() - ps."createdAt")) / 86400.0 as age_days,
          ps."preReviewed" as pre_reviewed
        FROM project_submission ps
        JOIN project p ON p.id = ps."projectId"
        JOIN "user" u ON u.id = p."userId"
        WHERE p."deletedAt" IS NULL
          AND u."fraudConvicted" = false
          AND ((ps.stage = 'DESIGN' AND p."designStatus" = 'in_review')
            OR (ps.stage = 'BUILD' AND p."buildStatus" = 'in_review'))
        ORDER BY ps."projectId", ps.stage, ps."createdAt" DESC
      )
      SELECT * FROM latest_subs ORDER BY submitted_at ASC LIMIT 10
    `,

    // 8: Admin outcomes (all-time)
    prisma.$queryRaw<{ decision: string; count: number }[]>`
      SELECT decision::text as decision, COUNT(*)::int as count
      FROM project_review_action GROUP BY decision ORDER BY decision
    `,

    // 9: Resubmission stats (combined design + build)
    prisma.$queryRaw<[{ avg_rounds: number; one: number; two: number; three: number; four_plus: number }]>`
      WITH sub_counts AS (
        SELECT "projectId", stage, COUNT(*)::int as cnt
        FROM project_submission GROUP BY "projectId", stage
      )
      SELECT
        COALESCE(AVG(cnt), 0)::float as avg_rounds,
        COUNT(*) FILTER (WHERE cnt = 1)::int as one,
        COUNT(*) FILTER (WHERE cnt = 2)::int as two,
        COUNT(*) FILTER (WHERE cnt = 3)::int as three,
        COUNT(*) FILTER (WHERE cnt >= 4)::int as four_plus
      FROM sub_counts
    `,

    // 10: Queue history — computed server-side from full event history, anchored to actual current queue
    prisma.$queryRaw<{ date: string; design: number; build: number }[]>`
      WITH all_events AS (
        SELECT DATE_TRUNC('day', "createdAt") as day, stage::text as stage, 1 as delta FROM project_submission
        UNION ALL
        SELECT DATE_TRUNC('day', "createdAt") as day, stage::text as stage, -1 as delta FROM project_review_action
      ),
      daily AS (
        SELECT day,
          COALESCE(SUM(delta) FILTER (WHERE stage = 'DESIGN'), 0)::int as dd,
          COALESCE(SUM(delta) FILTER (WHERE stage = 'BUILD'), 0)::int as bd
        FROM all_events GROUP BY day
      ),
      running AS (
        SELECT day, SUM(dd) OVER (ORDER BY day)::int as dc, SUM(bd) OVER (ORDER BY day)::int as bc FROM daily
      ),
      latest AS (SELECT dc, bc FROM running ORDER BY day DESC LIMIT 1),
      actual AS (
        SELECT COUNT(*) FILTER (WHERE p."designStatus" = 'in_review')::int as da,
          COUNT(*) FILTER (WHERE p."buildStatus" = 'in_review')::int as ba
        FROM project p
        JOIN "user" u ON u.id = p."userId"
        WHERE p."deletedAt" IS NULL AND u."fraudConvicted" = false
      ),
      days AS (SELECT generate_series(DATE_TRUNC('day', NOW() - INTERVAL '89 days'), DATE_TRUNC('day', NOW()), '1 day'::interval) as day)
      SELECT TO_CHAR(d.day, 'YYYY-MM-DD') as date,
        (r.dc + a.da - l.dc)::int as design,
        (r.bc + a.ba - l.bc)::int as build
      FROM days d CROSS JOIN latest l CROSS JOIN actual a
      JOIN LATERAL (SELECT dc, bc FROM running WHERE day <= d.day ORDER BY day DESC LIMIT 1) r ON true
      ORDER BY d.day
    `,

    // 11: Reviewer leaderboard (combined submission_review + project_review_action)
    prisma.$queryRaw<{
      reviewer_id: string; total: number; first_pass: number; admin: number;
      approved: number; returned: number; rejected: number;
      today: number; this_week: number; this_month: number; active_days: number;
    }[]>`
      WITH all_reviews AS (
        SELECT "reviewerId" as reviewer_id, "createdAt", false as is_admin,
          result::text as outcome
        FROM submission_review WHERE invalidated = false
        UNION ALL
        SELECT "reviewerId" as reviewer_id, "createdAt", true as is_admin,
          CASE WHEN decision = 'CHANGE_REQUESTED' THEN 'RETURNED' ELSE decision::text END
        FROM project_review_action WHERE "reviewerId" IS NOT NULL
      )
      SELECT reviewer_id,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE NOT is_admin)::int as first_pass,
        COUNT(*) FILTER (WHERE is_admin)::int as admin,
        COUNT(*) FILTER (WHERE outcome = 'APPROVED')::int as approved,
        COUNT(*) FILTER (WHERE outcome IN ('RETURNED', 'CHANGE_REQUESTED'))::int as returned,
        COUNT(*) FILTER (WHERE outcome = 'REJECTED')::int as rejected,
        COUNT(*) FILTER (WHERE "createdAt" >= DATE_TRUNC('day', NOW()))::int as today,
        COUNT(*) FILTER (WHERE "createdAt" >= DATE_TRUNC('week', NOW()))::int as this_week,
        COUNT(*) FILTER (WHERE "createdAt" >= DATE_TRUNC('month', NOW()))::int as this_month,
        COUNT(DISTINCT DATE_TRUNC('day', "createdAt"))::int as active_days
      FROM all_reviews GROUP BY reviewer_id ORDER BY total DESC
    `,

    // 11: Period counts (split first-pass vs admin decisions)
    prisma.$queryRaw<[{
      subs_today: number; decisions_today: number; first_pass_today: number;
      subs_week: number; decisions_week: number; first_pass_week: number;
      subs_month: number; decisions_month: number; first_pass_month: number;
      subs_all: number; decisions_all: number; first_pass_all: number;
    }]>`
      SELECT
        (SELECT COUNT(*)::int FROM project_submission WHERE "createdAt" >= DATE_TRUNC('day', NOW())) as subs_today,
        (SELECT COUNT(*)::int FROM project_review_action WHERE "createdAt" >= DATE_TRUNC('day', NOW())) as decisions_today,
        (SELECT COUNT(*)::int FROM submission_review WHERE "createdAt" >= DATE_TRUNC('day', NOW()) AND invalidated = false) as first_pass_today,
        (SELECT COUNT(*)::int FROM project_submission WHERE "createdAt" >= DATE_TRUNC('week', NOW())) as subs_week,
        (SELECT COUNT(*)::int FROM project_review_action WHERE "createdAt" >= DATE_TRUNC('week', NOW())) as decisions_week,
        (SELECT COUNT(*)::int FROM submission_review WHERE "createdAt" >= DATE_TRUNC('week', NOW()) AND invalidated = false) as first_pass_week,
        (SELECT COUNT(*)::int FROM project_submission WHERE "createdAt" >= DATE_TRUNC('month', NOW())) as subs_month,
        (SELECT COUNT(*)::int FROM project_review_action WHERE "createdAt" >= DATE_TRUNC('month', NOW())) as decisions_month,
        (SELECT COUNT(*)::int FROM submission_review WHERE "createdAt" >= DATE_TRUNC('month', NOW()) AND invalidated = false) as first_pass_month,
        (SELECT COUNT(*)::int FROM project_submission) as subs_all,
        (SELECT COUNT(*)::int FROM project_review_action) as decisions_all,
        (SELECT COUNT(*)::int FROM submission_review WHERE invalidated = false) as first_pass_all
    `,

    // 12: Wait-time distribution of the current queue — per-day bins (0..29, 30+ overflow), stage-split
    prisma.$queryRaw<{ day_bin: number; design: number; build: number }[]>`
      WITH pending AS (
        SELECT DISTINCT ON (ps."projectId", ps.stage)
          EXTRACT(EPOCH FROM (NOW() - ps."createdAt")) / 86400.0 as age_days,
          ps.stage::text as stage
        FROM project_submission ps
        JOIN project p ON p.id = ps."projectId"
        JOIN "user" u ON u.id = p."userId"
        WHERE p."deletedAt" IS NULL
          AND u."fraudConvicted" = false
          AND ((ps.stage = 'DESIGN' AND p."designStatus" = 'in_review')
            OR (ps.stage = 'BUILD' AND p."buildStatus" = 'in_review'))
        ORDER BY ps."projectId", ps.stage, ps."createdAt" DESC
      ),
      binned AS (
        SELECT LEAST(FLOOR(age_days), 30)::int as day_bin, stage FROM pending
      ),
      bins AS (SELECT generate_series(0, 30) as day_bin)
      SELECT b.day_bin::int as day_bin,
        COUNT(*) FILTER (WHERE binned.stage = 'DESIGN')::int as design,
        COUNT(*) FILTER (WHERE binned.stage = 'BUILD')::int as build
      FROM bins b LEFT JOIN binned ON binned.day_bin = b.day_bin
      GROUP BY b.day_bin ORDER BY b.day_bin
    `,
  ])

  // Fetch reviewer user info
  const reviewerIds = reviewerRaw.map(r => r.reviewer_id)
  const users = reviewerIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: reviewerIds } },
        select: { id: true, name: true, slackDisplayName: true, image: true },
      })
    : []
  const userMap = new Map(users.map(u => [u.id, { name: u.slackDisplayName || u.name, image: u.image }]))

  const q = queueStats[0]
  const p = periodCounts[0]
  const rs = resubmitStats[0] ?? { avg_rounds: 0, one: 0, two: 0, three: 0, four_plus: 0 }

  const outcomeMap: Record<string, number> = {}
  for (const r of adminOutcomes) outcomeMap[r.decision] = r.count

  const turnaroundMap: Record<string, { medianHours: number; p90Hours: number; samples: number }> = {}
  for (const r of turnaroundByStage) {
    turnaroundMap[r.stage] = {
      medianHours: Math.round(r.median_hours * 10) / 10,
      p90Hours: Math.round(r.p90_hours * 10) / 10,
      samples: r.sample_count,
    }
  }

  return NextResponse.json({
    queue: {
      total: q.total, design: q.design, build: q.build, preReviewed: q.pre_reviewed,
      medianWaitDays: Math.round(q.median_wait_days * 10) / 10,
      p90WaitDays: Math.round(q.p90_wait_days * 10) / 10,
      maxWaitDays: Math.round(q.max_wait_days * 10) / 10,
    },
    periods: {
      today: { submissions: p.subs_today, decisions: p.decisions_today, firstPass: p.first_pass_today },
      thisWeek: { submissions: p.subs_week, decisions: p.decisions_week, firstPass: p.first_pass_week },
      thisMonth: { submissions: p.subs_month, decisions: p.decisions_month, firstPass: p.first_pass_month },
      allTime: { submissions: p.subs_all, decisions: p.decisions_all, firstPass: p.first_pass_all },
    },
    dailyActivity,
    queueHistory: queueHistoryRaw,
    weeklyStats: weeklyStats.map(w => ({
      ...w, return_rate: Number(w.return_rate), week: w.week,
    })),
    turnaroundTrend: (() => {
      const grouped: Record<string, { week: string; designMedian: number; buildMedian: number; designP90: number; buildP90: number }> = {}
      for (const t of turnaroundTrend) {
        if (!grouped[t.week]) grouped[t.week] = { week: t.week, designMedian: 0, buildMedian: 0, designP90: 0, buildP90: 0 }
        if (t.stage === "DESIGN") { grouped[t.week].designMedian = Math.round(t.median_days * 10) / 10; grouped[t.week].designP90 = Math.round(t.p90_days * 10) / 10 }
        if (t.stage === "BUILD") { grouped[t.week].buildMedian = Math.round(t.median_days * 10) / 10; grouped[t.week].buildP90 = Math.round(t.p90_days * 10) / 10 }
      }
      return Object.values(grouped).sort((a, b) => a.week.localeCompare(b.week))
    })(),
    turnaround: {
      design: turnaroundMap.DESIGN ?? { medianHours: 0, p90Hours: 0, samples: 0 },
      build: turnaroundMap.BUILD ?? { medianHours: 0, p90Hours: 0, samples: 0 },
    },
    reviewFreshness,
    backlogAge,
    waitDistribution: waitDistRaw.map(r => ({ day: r.day_bin, design: r.design, build: r.build })),
    outcomes: {
      approved: outcomeMap.APPROVED ?? 0,
      returned: outcomeMap.CHANGE_REQUESTED ?? 0,
      rejected: outcomeMap.REJECTED ?? 0,
    },
    resubmissions: {
      avgRounds: Math.round(rs.avg_rounds * 10) / 10,
      distribution: [
        { rounds: '1', count: rs.one },
        { rounds: '2', count: rs.two },
        { rounds: '3', count: rs.three },
        { rounds: '4+', count: rs.four_plus },
      ],
    },
    reviewers: reviewerRaw.map(r => ({
      id: r.reviewer_id,
      name: userMap.get(r.reviewer_id)?.name ?? "Unknown",
      image: userMap.get(r.reviewer_id)?.image ?? null,
      total: r.total, firstPass: r.first_pass, admin: r.admin,
      approved: r.approved, returned: r.returned, rejected: r.rejected,
      today: r.today, week: r.this_week, month: r.this_month, activeDays: r.active_days,
    })),
    oldest: oldestPendingRaw.map(r => ({
      id: r.id, projectId: r.project_id, projectTitle: r.project_title,
      stage: r.stage, submittedAt: r.submitted_at,
      ageDays: Math.round(r.age_days * 10) / 10, preReviewed: r.pre_reviewed,
    })),
  })
}
