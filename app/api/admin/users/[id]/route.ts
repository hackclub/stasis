import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

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
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const userWithStats = {
    ...user,
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
  const adminCheck = await requireAdmin()
  if (adminCheck.error) return adminCheck.error

  const { id } = await params
  const body = await request.json()

  const { isAdmin, fraudConvicted } = body

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { isAdmin: true, fraudConvicted: true },
  })

  if (!existingUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const updateData: { isAdmin?: boolean; fraudConvicted?: boolean } = {}
  if (typeof isAdmin === "boolean") updateData.isAdmin = isAdmin
  if (typeof fraudConvicted === "boolean") updateData.fraudConvicted = fraudConvicted

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
  })

  if (typeof isAdmin === "boolean" && isAdmin !== existingUser.isAdmin) {
    await logAdminAction(
      isAdmin ? AuditAction.ADMIN_GRANT_ADMIN : AuditAction.ADMIN_REVOKE_ADMIN,
      adminCheck.session.user.id,
      adminCheck.session.user.email ?? undefined,
      "User",
      id,
      { oldValue: existingUser.isAdmin, newValue: isAdmin }
    )
  }

  if (typeof fraudConvicted === "boolean" && fraudConvicted !== existingUser.fraudConvicted) {
    await logAdminAction(
      fraudConvicted ? AuditAction.ADMIN_FLAG_FRAUD : AuditAction.ADMIN_UNFLAG_FRAUD,
      adminCheck.session.user.id,
      adminCheck.session.user.email ?? undefined,
      "User",
      id,
      { oldValue: existingUser.fraudConvicted, newValue: fraudConvicted }
    )
  }

  return NextResponse.json(user)
}
