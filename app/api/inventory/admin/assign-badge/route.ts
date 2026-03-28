import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { logAdminAction, AuditAction } from "@/lib/audit"
import { sanitize } from "@/lib/sanitize"

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const { session } = result

  const body = await request.json()
  const { userId, nfcId } = body

  if (!userId || typeof userId !== "string" || !nfcId || typeof nfcId !== "string") {
    return NextResponse.json(
      { error: "userId and nfcId are required" },
      { status: 400 }
    )
  }

  const safeNfcId = sanitize(nfcId).trim()
  if (safeNfcId.length === 0) {
    return NextResponse.json(
      { error: "nfcId is required" },
      { status: 400 }
    )
  }

  // Check if this nfcId is already assigned to someone else
  const existing = await prisma.user.findUnique({ where: { nfcId: safeNfcId } })
  if (existing && existing.id !== userId) {
    return NextResponse.json(
      { error: "This badge is already assigned to another user" },
      { status: 409 }
    )
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { nfcId: safeNfcId },
    select: { id: true, name: true, slackDisplayName: true, nfcId: true },
  })

  await logAdminAction(
    AuditAction.INVENTORY_BADGE_ASSIGN,
    session.user.id,
    session.user.email,
    "User",
    userId,
    { nfcId: safeNfcId }
  )

  return NextResponse.json(user)
}
