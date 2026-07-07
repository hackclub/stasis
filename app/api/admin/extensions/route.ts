import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { logAudit, AuditAction } from "@/lib/audit"

/**
 * GET /api/admin/extensions
 *   No params: list every user and project with a submission extension set
 *   (including expired ones, so they can be reviewed or cleared).
 *   ?q=term: search users (name/email/slackId) and projects (title/id) to
 *   grant an extension to.
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const q = request.nextUrl.searchParams.get("q")?.trim()

  if (q && q.length >= 2) {
    const [users, projects] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { slackId: q },
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          slackId: true,
          submissionExtensionUntil: true,
        },
        take: 10,
      }),
      prisma.project.findMany({
        where: {
          deletedAt: null,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { id: q },
          ],
        },
        select: {
          id: true,
          title: true,
          designStatus: true,
          buildStatus: true,
          submissionExtensionUntil: true,
          user: { select: { id: true, name: true, email: true } },
        },
        take: 10,
      }),
    ])

    return NextResponse.json({ users, projects })
  }

  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      where: { submissionExtensionUntil: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        slackId: true,
        submissionExtensionUntil: true,
      },
      orderBy: { submissionExtensionUntil: "desc" },
    }),
    prisma.project.findMany({
      where: { submissionExtensionUntil: { not: null } },
      select: {
        id: true,
        title: true,
        designStatus: true,
        buildStatus: true,
        submissionExtensionUntil: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { submissionExtensionUntil: "desc" },
    }),
  ])

  return NextResponse.json({ users, projects })
}

/**
 * POST /api/admin/extensions
 * Body: { targetType: "user" | "project", targetId: string, until: string | null }
 * until = ISO timestamp to grant/update, null to revoke.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error
  const { session } = authCheck

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const { targetType, targetId, until } = body as {
    targetType?: string
    targetId?: string
    until?: string | null
  }

  if (targetType !== "user" && targetType !== "project") {
    return NextResponse.json(
      { error: "targetType must be 'user' or 'project'" },
      { status: 400 }
    )
  }
  if (!targetId || typeof targetId !== "string") {
    return NextResponse.json({ error: "targetId is required" }, { status: 400 })
  }

  let untilDate: Date | null = null
  if (until != null) {
    untilDate = new Date(until)
    if (isNaN(untilDate.getTime())) {
      return NextResponse.json({ error: "Invalid 'until' date" }, { status: 400 })
    }
    if (untilDate <= new Date()) {
      return NextResponse.json(
        { error: "'until' must be in the future" },
        { status: 400 }
      )
    }
  }

  let label: string
  if (targetType === "user") {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, email: true },
    })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    await prisma.user.update({
      where: { id: targetId },
      data: { submissionExtensionUntil: untilDate },
    })
    label = user.name ?? user.email
  } else {
    const project = await prisma.project.findUnique({
      where: { id: targetId },
      select: { id: true, title: true, deletedAt: true },
    })
    if (!project || project.deletedAt) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }
    await prisma.project.update({
      where: { id: targetId },
      data: { submissionExtensionUntil: untilDate },
    })
    label = project.title
  }

  await logAudit({
    action: untilDate
      ? AuditAction.ADMIN_GRANT_EXTENSION
      : AuditAction.ADMIN_REVOKE_EXTENSION,
    actorId: session.user.id,
    actorEmail: session.user.email,
    targetType: targetType === "user" ? "User" : "Project",
    targetId,
    metadata: { label, until: untilDate?.toISOString() ?? null },
  })

  return NextResponse.json({
    ok: true,
    targetType,
    targetId,
    until: untilDate?.toISOString() ?? null,
  })
}
