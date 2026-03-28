import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

const PAGE_SIZE = 50

export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.REVIEW_PROJECTS)
  if (authCheck.error) return authCheck.error

  const url = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(url.get("page") || "1", 10))
  const search = url.get("search")?.trim() || ""
  const designStatus = url.get("designStatus") || ""
  const buildStatus = url.get("buildStatus") || ""
  const tierFilter = url.get("tier") || ""
  const starterFilter = url.get("starter") || ""
  const hiddenFilter = url.get("hidden") || ""
  const zeroGrant = url.get("zeroGrant")
  const deletedFilter = url.get("deleted") || ""
  const sort = url.get("sort") || "createdAt"
  const order = url.get("order") === "asc" ? "asc" : "desc"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  const andClauses: unknown[] = []

  if (search) {
    andClauses.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { id: { contains: search, mode: "insensitive" } },
      ],
    })
  }

  if (designStatus) {
    where.designStatus = designStatus
  }

  if (buildStatus) {
    where.buildStatus = buildStatus
  }

  if (tierFilter) {
    const tierNum = parseInt(tierFilter, 10)
    if (!isNaN(tierNum)) {
      where.tier = tierNum
    } else if (tierFilter === "none") {
      where.tier = null
    }
  }

  if (starterFilter === "true") {
    where.isStarter = true
  } else if (starterFilter === "false") {
    where.isStarter = false
  }

  if (hiddenFilter === "true") {
    where.hiddenFromGallery = true
  } else if (hiddenFilter === "false") {
    where.hiddenFromGallery = false
  }

  if (deletedFilter === "true") {
    where.deletedAt = { not: null }
  } else if (deletedFilter === "false") {
    where.deletedAt = null
  }

  if (zeroGrant === "true") {
    // Find projects where the LATEST design-approved action has $0 or null grant
    const zeroGrantCheck = await prisma.$queryRaw<Array<{ projectId: string }>>`
      SELECT "projectId" FROM (
        SELECT DISTINCT ON ("projectId") "projectId", "grantAmount"
        FROM "project_review_action"
        WHERE stage = 'DESIGN' AND decision = 'APPROVED'
        ORDER BY "projectId", "createdAt" DESC
      ) latest
      WHERE "grantAmount" IS NULL OR "grantAmount" = 0
    `
    andClauses.push({
      designStatus: "approved",
      id: { in: zeroGrantCheck.map((r) => r.projectId) },
    })
  }

  if (andClauses.length > 0) {
    where.AND = andClauses
  }

  // Determine orderBy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orderBy: any = { createdAt: order }
  if (sort === "title") orderBy = { title: order }
  else if (sort === "updatedAt") orderBy = { updatedAt: order }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        workSessions: {
          select: { hoursClaimed: true, hoursApproved: true, stage: true },
        },
      },
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.project.count({ where }),
  ])

  const items = projects.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    coverImage: p.coverImage,
    tier: p.tier,
    designStatus: p.designStatus,
    buildStatus: p.buildStatus,
    isStarter: p.isStarter,
    starterProjectId: p.starterProjectId,
    hiddenFromGallery: p.hiddenFromGallery,
    deletedAt: p.deletedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    user: p.user,
    totalHoursClaimed: p.workSessions.reduce((sum, s) => sum + s.hoursClaimed, 0),
    totalHoursApproved: p.workSessions.reduce((sum, s) => sum + (s.hoursApproved ?? 0), 0),
    sessionCount: p.workSessions.length,
  }))

  return NextResponse.json({
    items,
    total,
    page,
    limit: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  })
}
