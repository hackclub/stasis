import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission, hasPermission, getUserRoles } from "@/lib/permissions"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { Role } from "@/app/generated/prisma/client"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      projects: {
        include: {
          workSessions: {
            include: { media: true },
            orderBy: { createdAt: "desc" },
          },
          badges: true,
        },
        orderBy: { createdAt: "desc" },
      },
      roles: {
        select: { role: true },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const userWithStats = {
    ...user,
    roles: user.roles.map((r) => r.role),
    totalProjects: user.projects.length,
    totalHoursClaimed: user.projects.reduce(
      (acc, p) => acc + p.workSessions.reduce((a, s) => a + s.hoursClaimed, 0),
      0
    ),
    totalHoursApproved: user.projects.reduce(
      (acc, p) => acc + p.workSessions.reduce((a, s) => a + (s.hoursApproved ?? 0), 0),
      0
    ),
  }

  return NextResponse.json(userWithStats)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const actorRoles = await getUserRoles(session.user.id)
  const { id } = await params
  const body = await request.json()

  const { fraudConvicted, roles: newRoles } = body

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: {
      fraudConvicted: true,
      roles: { select: { role: true } },
    },
  })

  if (!existingUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const currentRoles = existingUser.roles.map((r) => r.role)

  if (Array.isArray(newRoles)) {
    if (!hasPermission(actorRoles, Permission.MANAGE_ROLES)) {
      return NextResponse.json(
        { error: "Forbidden: MANAGE_ROLES permission required" },
        { status: 403 }
      )
    }

    const validRoles = Object.values(Role)
    const validatedNewRoles = (newRoles as string[]).filter((r): r is Role => validRoles.includes(r as Role))
    
    const rolesToAdd = validatedNewRoles.filter((r) => !currentRoles.includes(r))
    const rolesToRemove = currentRoles.filter((r) => !validatedNewRoles.includes(r))

    for (const role of rolesToAdd) {
      await prisma.userRole.create({
        data: {
          user: { connect: { id } },
          role,
          grantedBy: session.user.id,
        },
      })
      await logAdminAction(
        AuditAction.ADMIN_GRANT_ROLE,
        session.user.id,
        session.user.email ?? undefined,
        "User",
        id,
        { role }
      )
    }

    for (const role of rolesToRemove) {
      await prisma.userRole.deleteMany({
        where: { userId: id, role },
      })
      await logAdminAction(
        AuditAction.ADMIN_REVOKE_ROLE,
        session.user.id,
        session.user.email ?? undefined,
        "User",
        id,
        { role }
      )
    }
  }

  if (typeof fraudConvicted === "boolean") {
    if (!hasPermission(actorRoles, Permission.MANAGE_USERS)) {
      return NextResponse.json(
        { error: "Forbidden: MANAGE_USERS permission required" },
        { status: 403 }
      )
    }

    await prisma.user.update({
      where: { id },
      data: { fraudConvicted },
    })

    if (fraudConvicted !== existingUser.fraudConvicted) {
      await logAdminAction(
        fraudConvicted ? AuditAction.ADMIN_FLAG_FRAUD : AuditAction.ADMIN_UNFLAG_FRAUD,
        session.user.id,
        session.user.email ?? undefined,
        "User",
        id,
        { oldValue: existingUser.fraudConvicted, newValue: fraudConvicted }
      )
    }
  }

  const updatedUser = await prisma.user.findUnique({
    where: { id },
    include: {
      roles: {
        select: { id: true, role: true, grantedAt: true },
      },
    },
  })

  return NextResponse.json({
    ...updatedUser,
    roles: updatedUser?.roles ?? [],
  })
}
