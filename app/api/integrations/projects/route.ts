import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireIntegrationAuth } from "@/lib/integration-auth"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

export async function GET(request: NextRequest) {
  const authError = requireIntegrationAuth(request)
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get("cursor")
  const limitParam = parseInt(searchParams.get("limit") || "", 10)
  const limit = Math.min(
    Number.isNaN(limitParam) || limitParam <= 0 ? DEFAULT_LIMIT : limitParam,
    MAX_LIMIT
  )
  const includeDeleted = searchParams.get("includeDeleted") === "true"
  const submittedOnly = searchParams.get("submittedOnly") === "true"
  const sinceParam = searchParams.get("updatedSince")
  const since = sinceParam ? new Date(sinceParam) : null
  if (since && Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { error: "Invalid updatedSince (expected ISO 8601)" },
      { status: 400 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (!includeDeleted) where.deletedAt = null
  if (since) where.updatedAt = { gte: since }
  if (submittedOnly) {
    // Anything that's left draft on both stages is considered un-submitted.
    where.NOT = { designStatus: "draft", buildStatus: "draft" }
  }

  const projects = await prisma.project.findMany({
    where,
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          slackId: true,
          slackDisplayName: true,
        },
      },
      submissions: {
        select: {
          id: true,
          stage: true,
          notes: true,
          preReviewed: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: { workSessions: true, kudos: true, bomItems: true },
      },
    },
  })

  let nextCursor: string | null = null
  if (projects.length > limit) {
    const last = projects.pop()!
    nextCursor = last.id
  }

  const items = projects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    coverImage: p.coverImage,
    githubRepo: p.githubRepo,
    tags: p.tags,
    tier: p.tier,
    bitsAwarded: p.bitsAwarded,
    requestedAmount: p.requestedAmount,
    isStarter: p.isStarter,
    starterProjectId: p.starterProjectId,
    hiddenFromGallery: p.hiddenFromGallery,
    deletedAt: p.deletedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    design: {
      status: p.designStatus,
      reviewedAt: p.designReviewedAt,
      reviewerId: p.designReviewedBy,
    },
    build: {
      status: p.buildStatus,
      reviewedAt: p.buildReviewedAt,
      reviewerId: p.buildReviewedBy,
    },
    user: p.user,
    submissions: p.submissions,
    counts: {
      workSessions: p._count.workSessions,
      kudos: p._count.kudos,
      bomItems: p._count.bomItems,
    },
  }))

  return NextResponse.json({ items, nextCursor })
}
