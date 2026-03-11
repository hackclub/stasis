import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; hackatimeId: string }> }
) {
  const authCheck = await requirePermission(Permission.REVIEW_SESSIONS)
  if (authCheck.error) return authCheck.error

  const { id: projectId, hackatimeId } = await params

  const hp = await prisma.hackatimeProject.findUnique({
    where: { id: hackatimeId },
    include: { project: true },
  })

  if (!hp) {
    return NextResponse.json({ error: "Hackatime project not found" }, { status: 404 })
  }

  if (hp.projectId !== projectId) {
    return NextResponse.json({ error: "Hackatime project does not belong to this project" }, { status: 400 })
  }

  const body = await request.json()
  const { hoursApproved } = body

  if (typeof hoursApproved !== "number" || hoursApproved < 0) {
    return NextResponse.json(
      { error: "hoursApproved must be a non-negative number" },
      { status: 400 }
    )
  }

  const updated = await prisma.hackatimeProject.update({
    where: { id: hackatimeId },
    data: {
      hoursApproved,
      reviewedAt: new Date(),
      reviewedBy: authCheck.session.user.id,
    },
  })

  await logAdminAction(
    AuditAction.ADMIN_REVIEW_HACKATIME,
    authCheck.session.user.id,
    authCheck.session.user.email ?? undefined,
    "HackatimeProject",
    hackatimeId,
    { hoursApproved, projectId }
  )

  return NextResponse.json(updated)
}
