import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { SHOP_ITEM_IDS } from "@/lib/shop"
import { sanitize } from "@/lib/sanitize"

/**
 * POST /api/admin/users/[id]/grant-open-sauce-ticket
 *
 * Marks a user as owning an Open Sauce ticket without charging bits, for
 * users who bought a ticket outside Stasis. Creates a 0-amount SHOP_PURCHASE
 * ledger row, which unlocks Flight Stipend purchases and shows the ticket as
 * owned in the shop (so they can't accidentally pay 250 bits for a spare).
 *
 * Body: { note?: string, dryRun?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const { id: userId } = await params
  const body = await request.json().catch(() => ({}))
  const note = typeof body.note === "string" ? sanitize(body.note).trim() : ""
  const dryRun = body.dryRun === true

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, attendRegisteredAt: true },
  })
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const existing = await prisma.currencyTransaction.count({
    where: {
      userId,
      type: "SHOP_PURCHASE",
      shopItemId: SHOP_ITEM_IDS.OPEN_SAUCE_TICKET,
    },
  })
  if (existing > 0) {
    return NextResponse.json(
      { error: "User already owns an Open Sauce ticket" },
      { status: 409 }
    )
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      wouldGrant: true,
      user: { id: user.id, email: user.email, name: user.name },
      stipendAlreadyUnlocked: !!user.attendRegisteredAt,
    })
  }

  // External ticket: the note flags this row so ticket fulfillment skips it.
  const fullNote = `Granted: Open Sauce Ticket (external ticket — do not fulfill)${note ? ` — ${note}` : ""}`

  const entry = await prisma.$transaction(async (tx) => {
    const { _sum } = await tx.currencyTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    })
    const balance = _sum.amount ?? 0
    return tx.currencyTransaction.create({
      data: {
        userId,
        amount: 0,
        type: "SHOP_PURCHASE",
        shopItemId: SHOP_ITEM_IDS.OPEN_SAUCE_TICKET,
        note: fullNote,
        balanceBefore: balance,
        balanceAfter: balance,
        createdBy: authCheck.session.user.id,
        fulfilledAt: new Date(),
      },
    })
  })

  await prisma.auditLog.create({
    data: {
      action: "ADMIN_GRANT_INVITE",
      actorId: authCheck.session.user.id,
      actorEmail: authCheck.session.user.email,
      targetType: "user",
      targetId: userId,
      metadata: { item: SHOP_ITEM_IDS.OPEN_SAUCE_TICKET, external: true, note },
    },
  })

  return NextResponse.json({ success: true, transactionId: entry.id })
}
