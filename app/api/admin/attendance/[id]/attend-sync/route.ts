import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { lookupAttendForCandidate } from "@/lib/attend-db"
import { syncOneCandidateAgainstAttend, deriveAttendDisplayState } from "@/lib/attend-sync"

/**
 * POST /api/admin/attendance/[id]/attend-sync
 *
 * Refreshes the cached attend* fields for one candidate from the read-only
 * Attend DB. Idempotent. Returns the live AttendStatus too so the modal can
 * paint travel legs / t-shirt / pronouns without an extra round trip.
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
    include: { user: { select: { email: true, slackId: true } } },
  })
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const email = candidate.user?.email ?? candidate.externalEmail ?? null
  const slackId = candidate.user?.slackId ?? candidate.externalSlackId ?? null
  if (!email && !slackId) {
    return NextResponse.json({ error: "No email or slackId on candidate" }, { status: 400 })
  }

  const summary = await syncOneCandidateAgainstAttend(prisma, id, "manual")
  const fresh = await prisma.attendanceCandidate.findUnique({
    where: { id },
    select: {
      attendInvited: true,
      attendOnboardingStarted: true,
      attendFlightBooked: true,
      attendStatus: true,
      attendCity: true,
      attendState: true,
      attendCountry: true,
      attendCachedAt: true,
    },
  })
  const attend = await lookupAttendForCandidate(email, slackId).catch(() => null)

  return NextResponse.json({
    attend,
    candidate: fresh,
    attendDisplayState: fresh ? deriveAttendDisplayState(fresh) : null,
    summary,
  })
}
