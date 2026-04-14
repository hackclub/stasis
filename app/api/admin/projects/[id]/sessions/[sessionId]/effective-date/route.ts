import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const { id: projectId, sessionId } = await params

  const workSession = await prisma.workSession.findUnique({
    where: { id: sessionId, projectId },
    select: { id: true, effectiveDate: true, createdAt: true },
  })

  if (!workSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const body = await request.json()
  const { effectiveDate } = body

  if (typeof effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return NextResponse.json(
      { error: "effectiveDate must be a YYYY-MM-DD string" },
      { status: 400 }
    )
  }

  const updated = await prisma.workSession.update({
    where: { id: sessionId },
    data: { effectiveDate },
    select: { id: true, effectiveDate: true, createdAt: true },
  })

  await logAdminAction(
    AuditAction.ADMIN_SET_EFFECTIVE_DATE,
    authCheck.session.user.id,
    authCheck.session.user.email ?? undefined,
    "WorkSession",
    sessionId,
    { projectId, effectiveDate, previousEffectiveDate: workSession.effectiveDate }
  )

  return NextResponse.json(updated)
}
