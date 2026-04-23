import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAnyPermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { getTierById } from "@/lib/tiers"
import { totalBomCost } from "@/lib/format"
import type { Prisma } from "@/app/generated/prisma/client"

type ResultLabel = "APPROVED" | "RETURNED" | "REJECTED"

export async function GET(request: NextRequest) {
  const authCheck = await requireAnyPermission(Permission.REVIEW_PROJECTS, Permission.VIEW_AUDIT_REVIEWS)
  if (authCheck.error) return authCheck.error

  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get("page") || "1", 10)
  const limit = parseInt(searchParams.get("limit") || "30", 10)
  const reviewer = searchParams.get("reviewer")
  const result = searchParams.get("result")
  const stage = searchParams.get("stage")
  const startDate = searchParams.get("startDate")
  const endDate = searchParams.get("endDate")
  const search = searchParams.get("search")
  const zeroGrant = searchParams.get("zeroGrant")

  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (startDate) dateFilter.gte = new Date(startDate)
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    dateFilter.lte = end
  }
  const hasDateFilter = Object.keys(dateFilter).length > 0

  // ── ProjectReviewAction filter
  const praWhere: Prisma.ProjectReviewActionWhereInput = {}
  if (reviewer) praWhere.reviewerId = reviewer
  if (result) {
    const decisionMap: Record<string, "APPROVED" | "CHANGE_REQUESTED" | "REJECTED"> = {
      APPROVED: "APPROVED",
      RETURNED: "CHANGE_REQUESTED",
      REJECTED: "REJECTED",
    }
    const mapped = decisionMap[result]
    if (mapped) praWhere.decision = mapped
  }
  if (stage === "DESIGN" || stage === "BUILD") praWhere.stage = stage
  if (hasDateFilter) praWhere.createdAt = dateFilter
  if (search) praWhere.project = { title: { contains: search, mode: "insensitive" } }

  // ── SubmissionReview filter (first-pass reviews + legacy admin reviews on submissions)
  const srWhere: Prisma.SubmissionReviewWhereInput = {}
  if (reviewer) srWhere.reviewerId = reviewer
  if (result) {
    const resultMap: Record<string, "APPROVED" | "RETURNED" | "REJECTED"> = {
      APPROVED: "APPROVED",
      RETURNED: "RETURNED",
      REJECTED: "REJECTED",
    }
    const mapped = resultMap[result]
    if (mapped) srWhere.result = mapped
  }
  const submissionFilter: Prisma.ProjectSubmissionWhereInput = {}
  if (stage === "DESIGN" || stage === "BUILD") submissionFilter.stage = stage
  if (search) submissionFilter.project = { title: { contains: search, mode: "insensitive" } }
  if (Object.keys(submissionFilter).length > 0) srWhere.submission = submissionFilter
  if (hasDateFilter) srWhere.createdAt = dateFilter

  // zeroGrant is PRA-specific (latest design-approved action with $0 grant); skip SRs when on.
  let zeroGrantOnly = false
  if (zeroGrant === "true") {
    zeroGrantOnly = true
    const zeroGrantActions = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM (
        SELECT DISTINCT ON ("projectId") id, "grantAmount"
        FROM "project_review_action"
        WHERE stage = 'DESIGN' AND decision = 'APPROVED'
        ORDER BY "projectId", "createdAt" DESC
      ) latest
      WHERE "grantAmount" IS NULL OR "grantAmount" = 0
    `
    praWhere.id = { in: zeroGrantActions.map((r) => r.id) }
  }

  const [praRows, srRows, reviewerUsers] = await Promise.all([
    prisma.projectReviewAction.findMany({
      where: praWhere,
      select: {
        id: true, projectId: true, stage: true, decision: true, comments: true,
        grantAmount: true, tier: true, tierBefore: true, reviewerId: true, createdAt: true,
      },
    }),
    zeroGrantOnly
      ? Promise.resolve([] as Array<{
          id: string; reviewerId: string; result: "APPROVED" | "RETURNED" | "REJECTED";
          isAdminReview: boolean; feedback: string; reason: string | null; invalidated: boolean;
          workUnitsOverride: number | null; tierOverride: number | null; grantOverride: number | null;
          categoryOverride: string | null;
          frozenTier: number | null; frozenFundingAmount: number | null; frozenWorkUnits: number | null;
          frozenEntryCount: number | null; frozenReviewerNote: string | null;
          paidAt: Date | null;
          createdAt: Date; submissionId: string;
          submission: { projectId: string; stage: "DESIGN" | "BUILD"; notes: string | null; preReviewed: boolean };
        }>)
      : prisma.submissionReview.findMany({
          where: srWhere,
          select: {
            id: true, reviewerId: true, result: true, isAdminReview: true,
            feedback: true, reason: true, invalidated: true,
            workUnitsOverride: true, tierOverride: true, grantOverride: true, categoryOverride: true,
            frozenTier: true, frozenFundingAmount: true, frozenWorkUnits: true,
            frozenEntryCount: true, frozenReviewerNote: true,
            paidAt: true,
            createdAt: true, submissionId: true,
            submission: { select: { projectId: true, stage: true, notes: true, preReviewed: true } },
          },
        }),
    // Reviewer dropdown: union reviewers across both tables
    prisma.$queryRaw<Array<{ id: string; name: string | null; slackDisplayName: string | null; image: string | null }>>`
      SELECT u.id, u.name, u."slackDisplayName", u.image
      FROM "user" u
      WHERE u.id IN (
        SELECT "reviewerId" FROM "project_review_action" WHERE "reviewerId" IS NOT NULL
        UNION
        SELECT "reviewerId" FROM "submission_review"
      )
      ORDER BY COALESCE(u."slackDisplayName", u.name) ASC
    `,
  ])

  // Prefer Slack display name for reviewer labels (this page is reviewer-accessible).
  const reviewerOptions = reviewerUsers.map((r) => ({
    id: r.id,
    name: r.slackDisplayName || r.name,
    image: r.image,
  }))

  const projectIds = new Set<string>()
  for (const r of praRows) projectIds.add(r.projectId)
  for (const r of srRows) projectIds.add(r.submission.projectId)

  const projects = projectIds.size > 0
    ? await prisma.project.findMany({
        where: { id: { in: Array.from(projectIds) } },
        include: {
          user: { select: { id: true, name: true, image: true } },
          workSessions: { select: { hoursClaimed: true, hoursApproved: true } },
          bomItems: { select: { totalCost: true, status: true } },
        },
      })
    : []
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const reviewerMap = new Map(reviewerOptions.map((r) => [r.id, r]))

  function formatProjectFields(project: (typeof projects)[number], effectiveTier: number | null) {
    const totalHours = project.workSessions.reduce(
      (sum, ws) => sum + (ws.hoursApproved ?? ws.hoursClaimed),
      0
    )
    const bomCost = totalBomCost(project.bomItems, project.bomTax, project.bomShipping)
    const costPerHour = totalHours > 0 ? bomCost / totalHours : 0
    const effective = effectiveTier ?? project.tier
    const tierInfo = effective ? getTierById(effective) : null
    const tierBits = tierInfo?.bits ?? 0
    const bitsPerHour = totalHours > 0 ? Math.round(tierBits / totalHours) : null
    return {
      id: project.id,
      title: project.title,
      tier: project.tier,
      coverImage: project.coverImage,
      author: project.user,
      totalHours: Math.round(totalHours * 100) / 100,
      bomCost: Math.round(bomCost * 100) / 100,
      bomTax: project.bomTax ?? 0,
      bomShipping: project.bomShipping ?? 0,
      costPerHour: Math.round(costPerHour * 100) / 100,
      bitsPerHour,
      tierBits,
      entryCount: project.workSessions.length,
    }
  }

  const items: Array<{
    id: string
    source: "project_review_action" | "submission_review"
    result: ResultLabel
    feedback: string
    reason: string | null
    createdAt: Date
    invalidated: boolean
    isAdminReview: boolean
    isFirstPass: boolean
    reviewer: { id: string; name: string | null; image: string | null }
    stage: string
    frozenWorkUnits: number | null
    frozenTier: number | null
    frozenFundingAmount: number | null
    frozenEntryCount: number | null
    frozenReviewerNote: string | null
    tierOverride: number | null
    grantOverride: number | null
    workUnitsOverride: number | null
    categoryOverride: string | null
    submissionNotes: string | null
    preReviewed: boolean | null
    paidAt: Date | null
    project: ReturnType<typeof formatProjectFields>
  }> = []

  for (const a of praRows) {
    const project = projectMap.get(a.projectId)
    if (!project) continue
    const resultLabel: ResultLabel =
      a.decision === "CHANGE_REQUESTED" ? "RETURNED"
        : a.decision === "APPROVED" ? "APPROVED"
          : "REJECTED"
    const reviewerUser = a.reviewerId ? reviewerMap.get(a.reviewerId) : null
    items.push({
      id: a.id,
      source: "project_review_action",
      result: resultLabel,
      feedback: a.comments || "",
      reason: null,
      createdAt: a.createdAt,
      invalidated: false,
      isAdminReview: true,
      isFirstPass: false,
      reviewer: {
        id: a.reviewerId || "",
        name: reviewerUser?.name ?? null,
        image: reviewerUser?.image ?? null,
      },
      stage: a.stage,
      frozenWorkUnits: null,
      frozenTier: a.tierBefore,
      frozenFundingAmount: null,
      frozenEntryCount: null,
      frozenReviewerNote: null,
      tierOverride: a.tier,
      grantOverride: a.grantAmount ? Math.round(a.grantAmount) : null,
      workUnitsOverride: null,
      categoryOverride: null,
      submissionNotes: null,
      preReviewed: null,
      paidAt: null,
      project: formatProjectFields(project, a.tier ?? project.tier),
    })
  }

  for (const r of srRows) {
    const project = projectMap.get(r.submission.projectId)
    if (!project) continue
    const reviewerUser = reviewerMap.get(r.reviewerId)
    items.push({
      id: r.id,
      source: "submission_review",
      result: r.result as ResultLabel,
      feedback: r.feedback,
      reason: r.reason,
      createdAt: r.createdAt,
      invalidated: r.invalidated,
      isAdminReview: r.isAdminReview,
      isFirstPass: !r.isAdminReview,
      reviewer: {
        id: r.reviewerId,
        name: reviewerUser?.name ?? null,
        image: reviewerUser?.image ?? null,
      },
      stage: r.submission.stage,
      frozenWorkUnits: r.frozenWorkUnits,
      frozenTier: r.frozenTier,
      frozenFundingAmount: r.frozenFundingAmount,
      frozenEntryCount: r.frozenEntryCount,
      frozenReviewerNote: r.frozenReviewerNote,
      tierOverride: r.tierOverride,
      grantOverride: r.grantOverride,
      workUnitsOverride: r.workUnitsOverride,
      categoryOverride: r.categoryOverride,
      submissionNotes: r.submission.notes,
      preReviewed: r.submission.preReviewed,
      paidAt: r.paidAt,
      project: formatProjectFields(project, r.tierOverride ?? r.frozenTier ?? project.tier),
    })
  }

  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const total = items.length
  const start = (page - 1) * limit
  const pageItems = items.slice(start, start + limit)

  return NextResponse.json({
    reviews: pageItems,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    reviewers: reviewerOptions,
  })
}
