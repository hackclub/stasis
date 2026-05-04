import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { SHOP_ITEM_IDS } from "@/lib/shop"

/**
 * Delete the historical zero-amount admin-grant rows for the Stasis Event
 * Invite. Their information is now persisted in User.attendRegisteredAt.
 *
 * Safety: skip rows whose user has attendRegisteredAt IS NULL — that would
 * mean the import missed them and deleting the row would erase the only
 * trace of their Attend membership. Those are returned in the response for
 * manual review.
 *
 * Body: { dryRun?: boolean }
 */
export async function POST(request: Request) {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const body = await request.json().catch(() => ({}))
  const dryRun: boolean = !!body?.dryRun

  const candidates = await prisma.currencyTransaction.findMany({
    where: {
      type: "SHOP_PURCHASE",
      shopItemId: SHOP_ITEM_IDS.STASIS_EVENT_INVITE,
      amount: 0,
      note: { startsWith: "Admin grant by " },
    },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { id: true, email: true, attendRegisteredAt: true } },
    },
  })

  const safe = candidates.filter((c) => !!c.user.attendRegisteredAt)
  const skipped = candidates.filter((c) => !c.user.attendRegisteredAt)

  let backfilledTimestamps = 0
  let deleted = 0

  if (!dryRun && safe.length > 0) {
    await prisma.$transaction(async (tx) => {
      // Backfill attendRegisteredAt = transaction.createdAt for any that are
      // null (defensive — they shouldn't be at this point given the safe filter).
      // Then delete the rows.
      for (const row of safe) {
        if (!row.user.attendRegisteredAt) {
          await tx.user.update({
            where: { id: row.userId },
            data: { attendRegisteredAt: row.createdAt },
          })
          backfilledTimestamps++
        }
      }
      const result = await tx.currencyTransaction.deleteMany({
        where: { id: { in: safe.map((r) => r.id) } },
      })
      deleted = result.count
    })
  }

  return NextResponse.json({
    dryRun,
    examined: candidates.length,
    deleted: dryRun ? safe.length : deleted,
    backfilledTimestamps,
    skippedNoAttend: skipped.length,
    skippedUsers: skipped.map((c) => ({
      userId: c.user.id,
      email: c.user.email,
      transactionId: c.id,
      transactionCreatedAt: c.createdAt,
    })),
  })
}
