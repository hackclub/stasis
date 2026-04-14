import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { TAMAGOTCHI_EVENT, getLocalDateStr, validateTimezone } from "@/lib/tamagotchi"

export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const body = await request.json()
  const { userId, date } = body

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be a YYYY-MM-DD string" }, { status: 400 })
  }

  if (date < TAMAGOTCHI_EVENT.START || date > TAMAGOTCHI_EVENT.END) {
    return NextResponse.json(
      { error: `date must be within event range (${TAMAGOTCHI_EVENT.START} to ${TAMAGOTCHI_EVENT.END})` },
      { status: 400 }
    )
  }

  // Validate date is not in the future (use server UTC date as a rough check)
  const tz = validateTimezone(request.nextUrl.searchParams.get("tz"))
  const todayStr = getLocalDateStr(new Date(), tz)
  if (date > todayStr) {
    return NextResponse.json({ error: "Cannot grant grace day for a future date" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  try {
    const graceDay = await prisma.streakGraceDay.create({
      data: {
        userId,
        date,
        grantedBy: authCheck.session.user.id,
      },
    })

    await logAdminAction(
      AuditAction.ADMIN_GRANT_STREAK_GRACE_DAY,
      authCheck.session.user.id,
      authCheck.session.user.email ?? undefined,
      "StreakGraceDay",
      graceDay.id,
      { userId, date }
    )

    return NextResponse.json(graceDay, { status: 201 })
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "Grace day already exists for this user and date" }, { status: 409 })
    }
    throw e
  }
}

export async function DELETE(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const body = await request.json()
  const { userId, date } = body

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be a YYYY-MM-DD string" }, { status: 400 })
  }

  try {
    const deleted = await prisma.streakGraceDay.delete({
      where: { userId_date: { userId, date } },
    })

    await logAdminAction(
      AuditAction.ADMIN_REVOKE_STREAK_GRACE_DAY,
      authCheck.session.user.id,
      authCheck.session.user.email ?? undefined,
      "StreakGraceDay",
      deleted.id,
      { userId, date }
    )

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Grace day not found" }, { status: 404 })
    }
    throw e
  }
}
