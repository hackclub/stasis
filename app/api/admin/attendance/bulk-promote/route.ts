import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { AttendanceStatus } from "@/app/generated/prisma/enums"

const PROMOTABLE_TARGETS = new Set<AttendanceStatus>(["CONTACTED", "SHELVED"])

/**
 * POST /api/admin/attendance/bulk-promote
 * Body: { ids: string[], targetStatus: 'CONTACTED' | 'SHELVED' }
 *
 * Moves candidates from IDENTIFIED → target status in one batch.
 * - On CONTACTED: stamps invitedAt for any row that doesn't already have one.
 * - Writes one audit entry per row per changed field.
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === "string").slice(0, 500) : []
  const targetStatus = typeof body.targetStatus === "string" ? body.targetStatus as AttendanceStatus : null

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 })
  }
  if (!targetStatus || !PROMOTABLE_TARGETS.has(targetStatus)) {
    return NextResponse.json({ error: "targetStatus must be CONTACTED or SHELVED" }, { status: 400 })
  }

  const candidates = await prisma.attendanceCandidate.findMany({
    where: { id: { in: ids } },
    select: { id: true, outreachStatus: true, invitedAt: true },
  })

  const actorId = authCheck.session!.user.id
  const now = new Date()

  const result = await prisma.$transaction(async (tx) => {
    let updated = 0
    let skipped = 0
    const auditRows: Array<{ candidateId: string; field: string; oldValue: string | null; newValue: string | null }> = []

    for (const c of candidates) {
      if (c.outreachStatus === targetStatus) {
        skipped += 1
        continue
      }
      const data: Record<string, unknown> = { outreachStatus: targetStatus }
      auditRows.push({
        candidateId: c.id,
        field: "outreachStatus",
        oldValue: c.outreachStatus,
        newValue: targetStatus,
      })
      if (targetStatus === "CONTACTED" && !c.invitedAt) {
        data.invitedAt = now
        auditRows.push({ candidateId: c.id, field: "invitedAt", oldValue: null, newValue: now.toISOString() })
      }
      await tx.attendanceCandidate.update({ where: { id: c.id }, data })
      updated += 1
    }

    if (auditRows.length > 0) {
      await tx.attendanceAuditEntry.createMany({
        data: auditRows.map((r) => ({ ...r, actorId })),
      })
    }

    return { updated, skipped }
  })

  return NextResponse.json({ ok: true, ...result })
}
