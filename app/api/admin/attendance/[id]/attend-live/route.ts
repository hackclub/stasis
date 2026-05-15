import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { lookupAttendForCandidate } from "@/lib/attend-db"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/attendance/[id]/attend-live
 *
 * Light-weight live read of the candidate's Attend record (no writes, no
 * derived stats). Used by the drag-into-BOOKED_FLIGHT confirmation modal so
 * the admin can eyeball whatever travel data Attend has before confirming.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error
  const { id } = await params

  const candidate = await prisma.attendanceCandidate.findUnique({
    where: { id },
    select: {
      externalEmail: true,
      externalSlackId: true,
      user: { select: { email: true, slackId: true } },
    },
  })
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const email = candidate.user?.email ?? candidate.externalEmail ?? null
  const slackId = candidate.user?.slackId ?? candidate.externalSlackId ?? null
  if (!email && !slackId) return NextResponse.json({ attend: null })

  const attend = await lookupAttendForCandidate(email, slackId).catch(() => null)
  return NextResponse.json({ attend })
}
