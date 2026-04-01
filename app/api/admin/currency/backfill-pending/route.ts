import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { appendLedgerEntry, CurrencyTransactionType } from "@/lib/currency"
import { getTierBits, getTierById } from "@/lib/tiers"

/**
 * POST /api/admin/currency/backfill-pending
 *
 * One-time backfill: creates DESIGN_APPROVED pending-bits ledger entries
 * for projects whose design was approved before the pending-bits feature
 * shipped. Only touches projects that have NO existing DESIGN_APPROVED entry.
 *
 * Dry-run by default — pass { "commit": true } in the body to actually write.
 */
export async function POST(request: Request) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => ({}))
  const commit = body.commit === true

  // Find projects with approved designs + a tier, that are currently in build stage
  const projects = await prisma.project.findMany({
    where: {
      designStatus: "approved",
      tier: { not: null },
    },
    select: {
      id: true,
      userId: true,
      tier: true,
      reviewActions: {
        where: { stage: "DESIGN", decision: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { grantAmount: true, reviewerId: true, createdAt: true },
      },
    },
  })

  // Filter to those with no existing DESIGN_APPROVED ledger entry
  const projectIds = projects.map((p) => p.id)
  const existing = await prisma.currencyTransaction.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: projectIds },
      type: "DESIGN_APPROVED",
    },
  })
  const existingSet = new Set(existing.map((e) => e.projectId))

  const toBackfill = projects.filter(
    (p) => !existingSet.has(p.id) && p.reviewActions.length > 0 && p.tier !== null
  )

  if (!commit) {
    const preview = toBackfill.map((p) => {
      const tierBits = getTierBits(p.tier!)
      const bomCost = Math.round(p.reviewActions[0].grantAmount ?? 0)
      const pendingBits = Math.max(0, tierBits - bomCost)
      return {
        projectId: p.id,
        userId: p.userId,
        tier: p.tier,
        tierBits,
        bomCost,
        pendingBits,
      }
    })
    return NextResponse.json({
      dryRun: true,
      count: preview.length,
      projects: preview,
    })
  }

  // Commit — run each backfill in its own transaction for safety
  const results: { projectId: string; pendingBits: number }[] = []

  for (const p of toBackfill) {
    const tierBits = getTierBits(p.tier!)
    const bomCost = Math.round(p.reviewActions[0].grantAmount ?? 0)
    const pendingBits = Math.max(0, tierBits - bomCost)

    if (pendingBits <= 0) continue

    const tierName = getTierById(p.tier!)!.name

    await prisma.$transaction(async (tx) => {
      await appendLedgerEntry(tx, {
        userId: p.userId,
        projectId: p.id,
        amount: pendingBits,
        type: CurrencyTransactionType.DESIGN_APPROVED,
        note: `Backfill — Design approved — ${tierName} (${tierBits} − ${bomCost} BOM = ${pendingBits} pending bits)`,
      })
    })

    results.push({ projectId: p.id, pendingBits })
  }

  return NextResponse.json({
    dryRun: false,
    backfilled: results.length,
    results,
  })
}
