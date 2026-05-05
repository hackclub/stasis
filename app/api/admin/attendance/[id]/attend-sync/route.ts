import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { lookupAttendByEmail } from "@/lib/attend-db"

/**
 * POST /api/admin/attendance/[id]/attend-sync
 * Refreshes the cached `attendInvited` + `attendFlightBooked` columns from
 * the read-only Attend DB. Idempotent.
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
    include: { user: { select: { email: true } } },
  })
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const email = candidate.user?.email ?? candidate.externalEmail
  if (!email) {
    return NextResponse.json({ error: "No email on candidate" }, { status: 400 })
  }

  const attend = await lookupAttendByEmail(email).catch(() => null)
  await prisma.attendanceCandidate.update({
    where: { id },
    data: {
      attendInvited: !!attend?.found,
      attendFlightBooked: !!attend?.hasFlight,
      attendCity: attend?.city ?? null,
      attendState: attend?.state ?? null,
      attendCountry: attend?.country ?? null,
      attendCachedAt: new Date(),
    },
  })

  return NextResponse.json({ attend, attendInvited: !!attend?.found, attendFlightBooked: !!attend?.hasFlight })
}
