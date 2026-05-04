import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { runInvitePurchaseSideEffects } from "@/lib/attend"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const { id: userId } = await params

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, attendRegisteredAt: true },
  })
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  if (user.attendRegisteredAt) {
    return NextResponse.json(
      { error: "User is already registered on Attend" },
      { status: 409 }
    )
  }

  await runInvitePurchaseSideEffects({
    userId: user.id,
    email: user.email,
    name: user.name,
  })

  // Re-read to learn whether registration actually succeeded
  const after = await prisma.user.findUnique({
    where: { id: userId },
    select: { attendRegisteredAt: true, attendLastError: true },
  })

  if (!after?.attendRegisteredAt) {
    return NextResponse.json(
      {
        error: "Attend registration failed",
        detail: after?.attendLastError ?? null,
      },
      { status: 502 }
    )
  }

  await prisma.auditLog.create({
    data: {
      action: "ADMIN_GRANT_INVITE",
      actorId: authCheck.session.user.id,
      actorEmail: authCheck.session.user.email,
      targetType: "user",
      targetId: userId,
    },
  })

  return NextResponse.json({ success: true })
}
