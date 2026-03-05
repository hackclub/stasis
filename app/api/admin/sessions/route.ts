import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"

export async function DELETE() {
  const authCheck = await requireAdmin()
  if (authCheck.error) return authCheck.error

  const adminSessionId = authCheck.session.session.id

  // Delete all sessions except the admin's own current session
  const { count } = await prisma.session.deleteMany({
    where: { id: { not: adminSessionId } },
  })

  await logAdminAction(
    AuditAction.ADMIN_LOGOUT_ALL_USERS,
    authCheck.session.user.id,
    authCheck.session.user.email ?? undefined,
    "Session",
    undefined,
    { sessionsDeleted: count }
  )

  return NextResponse.json({ count })
}
