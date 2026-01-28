import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { logAudit, AuditAction } from "@/lib/audit"
import { headers } from "next/headers"
import { ProjectTag } from "@/app/generated/prisma/enums"
import { sanitize } from "@/lib/sanitize"
import { getUserRoles, hasRole, Role } from "@/lib/permissions"

const ALLOWED_UPDATE_FIELDS = ["title", "description", "tags", "isStarter", "starterProjectId", "githubRepo", "coverImage"] as const

type AllowedUpdateField = typeof ALLOWED_UPDATE_FIELDS[number]

function pickAllowedFields(body: Record<string, unknown>): Partial<{
  title: string
  description: string | null
  tags: ProjectTag[]
  isStarter: boolean
  starterProjectId: string | null
  githubRepo: string | null
  coverImage: string | null
}> {
  const result: Record<string, unknown> = {}
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (field in body) {
      const value = body[field]
      if (typeof value === "string") {
        result[field] = sanitize(value)
      } else {
        result[field] = value
      }
    }
  }
  return result
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)

  const project = await prisma.project.findUnique({
    where: { id },
    include: { 
      workSessions: {
        include: { media: true },
        orderBy: { createdAt: 'desc' },
      }, 
      badges: true,
      bomItems: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (project.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const totalHoursClaimed = project.workSessions.reduce(
    (acc, s) => acc + s.hoursClaimed,
    0
  )
  const totalHoursApproved = project.workSessions.reduce(
    (acc, s) => acc + (s.hoursApproved ?? 0),
    0
  )

  return NextResponse.json({ ...project, totalHoursClaimed, totalHoursApproved })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)

  const existingProject = await prisma.project.findUnique({
    where: { id },
  })

  if (!existingProject) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (existingProject.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Prevent editing while either stage is in review (unless admin)
  const inReview = existingProject.designStatus === "in_review" || existingProject.buildStatus === "in_review"
  if (inReview && !isAdmin) {
    return NextResponse.json({ error: "Cannot edit project while in review" }, { status: 403 })
  }

  const body = await request.json()
  const allowedData = pickAllowedFields(body)

  if (Object.keys(allowedData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const project = await prisma.project.update({
    where: { id },
    data: allowedData,
  })

  return NextResponse.json(project)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const roles = await getUserRoles(session.user.id)
  const isAdmin = hasRole(roles, Role.ADMIN)

  const existingProject = await prisma.project.findUnique({
    where: { id },
  })

  if (!existingProject) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  if (existingProject.userId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const approvedSessionCount = await prisma.workSession.count({
    where: { 
      projectId: id,
      hoursApproved: { not: null }
    }
  })

  if (approvedSessionCount > 0 && !isAdmin) {
    return NextResponse.json({ error: "Cannot delete project with approved sessions" }, { status: 403 })
  }

  await prisma.project.delete({ where: { id } })

  await logAudit({
    action: AuditAction.USER_DELETE_PROJECT,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: "Project",
    targetId: id,
    metadata: { title: existingProject.title },
  })

  return NextResponse.json({ success: true })
}
