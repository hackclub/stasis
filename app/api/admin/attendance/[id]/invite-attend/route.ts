import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { registerAttendParticipant, splitName } from "@/lib/attend"
import { sendInviteConfirmationEmail } from "@/lib/loops"

/**
 * POST /api/admin/attendance/[id]/invite-attend
 *
 * Sends the candidate an Attend invite (registers them on attend.hackclub.com)
 * and the Loops branded invite email. Works for both linked Stasis users and
 * external candidates — the only requirement is an email on file.
 *
 * For Stasis users, also stamps user.attendRegisteredAt so the user-level
 * "already registered on Attend" guard stays in sync with what we did here.
 *
 * Side effects always:
 *   - candidate.attendInvited := true
 *   - audit entry
 * Side effects when there's a linked user:
 *   - user.attendRegisteredAt := now (if not already set)
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error
  const { id } = await params

  const candidate = await prisma.attendanceCandidate.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true, attendRegisteredAt: true } } },
  })
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const email = candidate.user?.email ?? candidate.externalEmail ?? null
  const fullName = candidate.user?.name ?? candidate.externalName ?? null
  if (!email) {
    return NextResponse.json({ error: "No email on candidate — can't send invite" }, { status: 400 })
  }

  // If the linked user is already registered, treat as a no-op success.
  if (candidate.user?.attendRegisteredAt) {
    if (!candidate.attendInvited) {
      await prisma.attendanceCandidate.update({
        where: { id },
        data: { attendInvited: true },
      })
    }
    return NextResponse.json({ ok: true, alreadyRegistered: true })
  }

  const { firstName, lastName } = splitName(fullName)

  const [, attendResult] = await Promise.all([
    sendInviteConfirmationEmail({ email, firstName }).catch((err) => {
      console.error("[attendance/invite-attend] Loops email failed:", err)
    }),
    registerAttendParticipant({ firstName, lastName, email }).catch((err) => ({
      ok: false as const,
      status: 0,
      body: err instanceof Error ? err.message : String(err),
    })),
  ])

  if (!attendResult.ok) {
    if ("skipped" in attendResult) {
      return NextResponse.json(
        { error: "ATTEND_API_KEY not configured on the server" },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { error: "Attend registration failed", detail: `[${attendResult.status}] ${attendResult.body}`.slice(0, 500) },
      { status: 502 }
    )
  }

  const actorId = authCheck.session!.user.id
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    // attendInvited=true (we just sent it). attendOnboardingStarted stays false
    // until they actually accept and a participant row is created in Attend.
    await tx.attendanceCandidate.update({
      where: { id },
      data: { attendInvited: true, attendCachedAt: now },
    })
    if (candidate.user?.id && !candidate.user.attendRegisteredAt) {
      await tx.user.update({
        where: { id: candidate.user.id },
        data: { attendRegisteredAt: now, attendLastError: null },
      })
    }
    await tx.attendanceAuditEntry.create({
      data: {
        candidateId: id,
        actorId,
        field: "attendInvited",
        oldValue: candidate.attendInvited ? "true" : "false",
        newValue: "true",
      },
    })
  })

  return NextResponse.json({ ok: true, alreadyRegistered: attendResult.alreadyRegistered })
}
