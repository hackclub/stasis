import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { appendLedgerEntry, CurrencyTransactionType } from "@/lib/currency"

/**
 * POST /api/admin/currency/fix-pending
 *
 * Fixes orphaned DESIGN_APPROVED entries for projects whose builds are already
 * approved. These were created by the backfill-pending script which didn't
 * check build status.
 *
 * For each build-approved project with a net-positive DESIGN_APPROVED balance,
 * creates a reversal entry to zero it out.
 *
 * Dry-run by default — pass { "commit": true } in the body to actually write.
 */
export async function POST(request: Request) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => ({}))
  const commit = body.commit === true

  // Find all projects that have build approved
  const buildApprovedProjects = await prisma.project.findMany({
    where: { buildStatus: "approved" },
    select: { id: true, userId: true, title: true },
  })

  const projectIds = buildApprovedProjects.map((p) => p.id)

  // Find net DESIGN_APPROVED balance per project
  const pendingSums = await prisma.currencyTransaction.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: projectIds },
      type: "DESIGN_APPROVED",
    },
    _sum: { amount: true },
  })

  // Filter to those with a net positive balance (orphaned pending bits)
  const toFix = pendingSums
    .filter((s) => (s._sum.amount ?? 0) > 0)
    .map((s) => {
      const project = buildApprovedProjects.find((p) => p.id === s.projectId)!
      return {
        projectId: s.projectId,
        userId: project.userId,
        title: project.title,
        pendingAmount: s._sum.amount!,
      }
    })

  if (!commit) {
    return NextResponse.json({
      dryRun: true,
      toFix: toFix.length,
      totalBitsToReverse: toFix.reduce((acc, t) => acc + t.pendingAmount, 0),
      details: toFix,
    })
  }

  // Create reversal entries
  const results: Array<{ projectId: string; reversed: number }> = []

  for (const item of toFix) {
    await prisma.$transaction(async (tx) => {
      await appendLedgerEntry(tx, {
        userId: item.userId,
        projectId: item.projectId ?? undefined,
        amount: -item.pendingAmount,
        type: CurrencyTransactionType.DESIGN_APPROVED,
        note: `Fix: pending bits reversed — build already approved`,
      })
    })
    results.push({ projectId: item.projectId, reversed: item.pendingAmount })
  }

  return NextResponse.json({
    dryRun: false,
    fixed: results.length,
    totalBitsReversed: results.reduce((acc, r) => acc + r.reversed, 0),
    details: results,
  })
}
