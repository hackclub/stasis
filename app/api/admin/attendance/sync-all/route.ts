import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { syncCandidatesAgainstAttend } from "@/lib/attend-sync"
import { getAttendPool } from "@/lib/attend-db"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * POST /api/admin/attendance/sync-all
 *
 * Manual full-sweep refresh of every candidate's cached attend* fields.
 * Same code path as the hourly cron — this is the "Resync attend" button on
 * the dashboard. Returns counts so the UI can render a status sub-line.
 */
export async function POST(_request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  if (!getAttendPool()) {
    return NextResponse.json(
      { error: "Attend integration disabled (READONLY_ATTEND_DATABASE_URL not set)" },
      { status: 503 }
    )
  }

  const result = await syncCandidatesAgainstAttend(prisma, { actorLabel: "manual" })
  return NextResponse.json({ ...result, syncedAt: new Date().toISOString() })
}
