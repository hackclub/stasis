import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

/**
 * One-shot data migration: concatenates legacy `caseForThem`, `statusNote`,
 * and `flakeNote` columns into the unified `notes` column on
 * `attendance_candidate`. Idempotent — only touches rows where at least one
 * of the three legacy columns is non-empty AND the result would actually
 * change `notes`.
 *
 * Run BEFORE `prisma migrate dev` drops the three legacy columns.
 *
 * POST body: { dryRun?: boolean }  (defaults to dryRun = true)
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_ATTENDANCE)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dryRun !== false

  // Pull all rows that have any legacy content. Use raw SQL because the
  // legacy columns may already be removed from the Prisma schema.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string
      caseForThem: string | null
      statusNote: string | null
      flakeNote: string | null
      notes: string | null
    }>
  >(
    `SELECT id,
            "caseForThem",
            "statusNote",
            "flakeNote",
            notes
     FROM attendance_candidate
     WHERE "caseForThem" IS NOT NULL
        OR "statusNote"  IS NOT NULL
        OR "flakeNote"   IS NOT NULL`
  )

  const updates: Array<{ id: string; before: string | null; after: string }> = []

  for (const r of rows) {
    const parts: string[] = []
    if (r.caseForThem?.trim()) parts.push(`Case for them: ${r.caseForThem.trim()}`)
    if (r.statusNote?.trim())  parts.push(`Status: ${r.statusNote.trim()}`)
    if (r.flakeNote?.trim())   parts.push(`Flake: ${r.flakeNote.trim()}`)
    if (r.notes?.trim())       parts.push(r.notes.trim())
    const merged = parts.join("\n\n")
    if (merged === (r.notes ?? "")) continue
    updates.push({ id: r.id, before: r.notes, after: merged })
  }

  if (!dryRun && updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.attendanceCandidate.update({
          where: { id: u.id },
          data: { notes: u.after },
        })
      )
    )
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    candidatesScanned: rows.length,
    candidatesUpdated: updates.length,
    sample: updates.slice(0, 5).map((u) => ({
      id: u.id,
      beforePreview: u.before?.slice(0, 120) ?? null,
      afterPreview: u.after.slice(0, 240),
    })),
  })
}
