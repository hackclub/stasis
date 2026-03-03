import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { BadgeType } from "@/app/generated/prisma/enums"
import { MAX_BADGES_PER_PROJECT } from "@/lib/badges"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

function isValidBadge(value: unknown): value is BadgeType {
  return typeof value === "string" && Object.values(BadgeType).includes(value as BadgeType)
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get("projectId")

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const badges = await prisma.projectBadge.findMany({
    where: { projectId },
    orderBy: { claimedAt: "desc" },
  })

  return NextResponse.json(badges)
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { badge, projectId } = body

  if (!isValidBadge(badge)) {
    return NextResponse.json({ error: "Invalid badge type" }, { status: 400 })
  }

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existingBadges = await prisma.projectBadge.findMany({
    where: { projectId },
  })

  if (existingBadges.some(b => b.badge === badge)) {
    return NextResponse.json({ error: "Badge already claimed for this project" }, { status: 400 })
  }

  if (existingBadges.length >= MAX_BADGES_PER_PROJECT) {
    return NextResponse.json({ error: `Maximum ${MAX_BADGES_PER_PROJECT} badges per project` }, { status: 400 })
  }

  // Check if badge is already claimed on another project by this user
  const claimedElsewhere = await prisma.projectBadge.findFirst({
    where: {
      badge,
      projectId: { not: projectId },
      project: { userId: session.user.id },
    },
  })

  if (claimedElsewhere) {
    return NextResponse.json({ error: "Badge already in use on another project" }, { status: 400 })
  }

  const projectBadge = await prisma.projectBadge.create({
    data: {
      badge,
      projectId,
    },
  })

  return NextResponse.json(projectBadge)
}
