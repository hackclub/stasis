import { CurrencyTransactionType } from "@/app/generated/prisma/enums"
import type { Prisma } from "@/app/generated/prisma/client"

type TxClient = Prisma.TransactionClient

interface LedgerEntryParams {
  userId: string
  projectId?: string
  amount: number          // positive = credit, negative = debit
  type: CurrencyTransactionType
  note?: string
  createdBy?: string      // admin user ID; omit for system-generated entries
  shopItemId?: string     // tag the entry to a shop item (e.g. so a SHOP_REFUND
                          // nets out against the matching SHOP_PURCHASE rows in
                          // downstream rollups like the travel-reimbursement sync)
}

/**
 * Appends one immutable entry to the bits ledger.
 *
 * MUST be called inside a prisma.$transaction() callback so that
 * balanceBefore/balanceAfter and the new row are written atomically.
 */
export async function appendLedgerEntry(
  tx: TxClient,
  params: LedgerEntryParams
) {
  const { userId, projectId, amount, type, note, createdBy, shopItemId } = params

  const { _sum } = await tx.currencyTransaction.aggregate({
    where: { userId },
    _sum: { amount: true },
  })

  const balanceBefore = _sum.amount ?? 0
  const balanceAfter = balanceBefore + amount

  return tx.currencyTransaction.create({
    data: {
      userId,
      projectId: projectId ?? null,
      amount,
      type,
      note: note ?? null,
      balanceBefore,
      balanceAfter,
      createdBy: createdBy ?? null,
      shopItemId: shopItemId ?? null,
    },
  })
}

export { CurrencyTransactionType }
