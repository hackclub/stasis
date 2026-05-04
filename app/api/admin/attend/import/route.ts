import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

/**
 * Bulk-mark users as registered on Attend by email. Intended as a one-off
 * import from an Attend CSV/JSON export, run by an admin once Attend's
 * GET endpoint is back this can be replaced by a live sync route.
 *
 * Body: { emails: string[], dryRun?: boolean }
 * Returns counts and the list of unmatched emails for manual triage.
 */
export async function POST(request: Request) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.emails)) {
    return NextResponse.json(
      { error: "Body must be { emails: string[], dryRun?: boolean }" },
      { status: 400 }
    )
  }

  const dryRun: boolean = !!body.dryRun
  const normalized = (body.emails as unknown[])
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)

  const unique = Array.from(new Set(normalized))

  const matched = await prisma.user.findMany({
    where: { email: { in: unique, mode: "insensitive" } },
    select: { id: true, email: true, attendRegisteredAt: true },
  })

  const matchedLower = new Set(matched.map((u) => u.email.toLowerCase()))
  const unmatched = unique.filter((e) => !matchedLower.has(e))

  const newlyFlagged = matched.filter((u) => !u.attendRegisteredAt)
  const refreshed = matched.filter((u) => !!u.attendRegisteredAt)

  const now = new Date()

  if (!dryRun && newlyFlagged.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: newlyFlagged.map((u) => u.id) } },
      data: { attendRegisteredAt: now, attendLastSyncedAt: now },
    })
  }
  if (!dryRun && refreshed.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: refreshed.map((u) => u.id) } },
      data: { attendLastSyncedAt: now },
    })
  }

  return NextResponse.json({
    dryRun,
    received: body.emails.length,
    uniqueEmails: unique.length,
    matched: matched.length,
    newlyFlagged: newlyFlagged.length,
    alreadyOnAttend: refreshed.length,
    unmatchedCount: unmatched.length,
    unmatchedEmails: unmatched,
  })
}
