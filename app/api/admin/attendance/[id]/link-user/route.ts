import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

/**
 * POST /api/admin/attendance/[id]/link-user
 * Links an external attendance candidate to a Stasis user.
 *
 * Body: { userId: string }
 *
 * - Refuses to relink an already-linked candidate (use a separate unlink flow).
 * - Refuses if the target user already owns a different candidate
 *   (`AttendanceCandidate.userId` is `@unique`).
 * - Wipes the `external*` fields (the user record is now the source of truth)
 *   and writes one audit entry per cleared field, plus the userId transition.
 * - Auto-derives `isGirl=true` when currently null and the user's pronouns are
 *   "she/her" — same heuristic as candidate creation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error
  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const userId = typeof body.userId === "string" && body.userId.length > 0 ? body.userId : null
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 })
  }

  const existing = await prisma.attendanceCandidate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
  if (existing.userId) {
    return NextResponse.json(
      { error: "Candidate is already linked to a Stasis user" },
      { status: 409 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, pronouns: true, fraudConvicted: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (user.fraudConvicted) {
    return NextResponse.json({ error: "User is fraud-convicted" }, { status: 400 })
  }

  const conflict = await prisma.attendanceCandidate.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (conflict) {
    return NextResponse.json(
      { error: "Another candidate is already linked to this user", candidateId: conflict.id },
      { status: 409 }
    )
  }

  const audit: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [
    { field: "userId", oldValue: null, newValue: userId },
  ]
  if (existing.externalName) audit.push({ field: "externalName", oldValue: existing.externalName, newValue: null })
  if (existing.externalEmail) audit.push({ field: "externalEmail", oldValue: existing.externalEmail, newValue: null })
  if (existing.externalSlackId) audit.push({ field: "externalSlackId", oldValue: existing.externalSlackId, newValue: null })
  if (existing.externalImage) audit.push({ field: "externalImage", oldValue: existing.externalImage, newValue: null })

  let nextIsGirl: boolean | null = existing.isGirl
  if (existing.isGirl === null && user.pronouns && user.pronouns.toLowerCase() === "she/her") {
    nextIsGirl = true
    audit.push({ field: "isGirl", oldValue: null, newValue: "true" })
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.attendanceCandidate.update({
        where: { id },
        data: {
          userId,
          externalName: null,
          externalEmail: null,
          externalSlackId: null,
          externalImage: null,
          isGirl: nextIsGirl,
        },
      })
      await tx.attendanceAuditEntry.createMany({
        data: audit.map((a) => ({
          candidateId: id,
          actorId: authCheck.session!.user.id,
          field: a.field,
          oldValue: a.oldValue,
          newValue: a.newValue,
        })),
      })
    })
  } catch (err) {
    // Race: another link landed between the conflict check and the update.
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Another candidate just claimed this user — refresh and try again" },
        { status: 409 }
      )
    }
    throw err
  }

  return NextResponse.json({ ok: true })
}
