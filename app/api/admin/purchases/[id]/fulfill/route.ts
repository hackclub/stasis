import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"

/**
 * PATCH /api/admin/purchases/[id]/fulfill
 *
 * Marks a shop purchase as fulfilled.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const { id } = await params

  const transaction = await prisma.currencyTransaction.findUnique({
    where: { id },
    select: { id: true, type: true, fulfilledAt: true },
  })

  if (!transaction) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  }

  if (transaction.type !== "SHOP_PURCHASE") {
    return NextResponse.json({ error: "Only shop purchases can be fulfilled" }, { status: 400 })
  }

  if (transaction.fulfilledAt) {
    return NextResponse.json({ error: "Already fulfilled" }, { status: 400 })
  }

  const updated = await prisma.currencyTransaction.update({
    where: { id },
    data: { fulfilledAt: new Date() },
    select: { id: true, fulfilledAt: true },
  })

  return NextResponse.json(updated)
}
