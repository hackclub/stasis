import { CurrencyTransactionType } from "@/app/generated/prisma/enums"
import type { Prisma } from "@/app/generated/prisma/client"
import { PENDING_BITS_ELIGIBLE_IDS } from "@/lib/shop"

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

/**
 * Pending bits = design-approval bits for projects whose build hasn't been
 * approved yet, plus the unused part of pending-only credits (event
 * discounts and similar admin grants written as project-less DESIGN_APPROVED
 * entries, only usable on pending-eligible items).
 *
 * Do NOT compute this by summing every DESIGN_APPROVED entry: no build
 * approval ever nets out a project-less credit, so a blind sum overcounts
 * forever and hides real spendable bits once the credit has been spent.
 * Instead, project pending comes from project state, and each credit counts
 * only until pending-eligible purchases have consumed it (credits are
 * attributed to those purchases first, before project pending).
 *
 * Credits vs purchase drains: both are project-less DESIGN_APPROVED entries,
 * but drains always carry the shopItemId they paid for and credits never do.
 */
export async function getPendingBits(tx: TxClient, userId: string): Promise<number> {
  const rows = await tx.$queryRaw<
    { project_pending: bigint | null; credit: bigint | null; eligible_spend: bigint | null }[]
  >`
    SELECT
      (SELECT COALESCE(SUM(ct.amount), 0)
         FROM currency_transaction ct
         JOIN project p ON p.id = ct."projectId"
        WHERE ct."userId" = ${userId}
          AND ct.type::text = 'DESIGN_APPROVED'
          AND p."buildStatus"::text <> 'approved') AS project_pending,
      (SELECT COALESCE(SUM(ct.amount), 0)
         FROM currency_transaction ct
        WHERE ct."userId" = ${userId}
          AND ct.type::text = 'DESIGN_APPROVED'
          AND ct."projectId" IS NULL
          AND ct."shopItemId" IS NULL) AS credit,
      (SELECT COALESCE(-SUM(ct.amount), 0)
         FROM currency_transaction ct
        WHERE ct."userId" = ${userId}
          AND ct."shopItemId" = ANY(${[...PENDING_BITS_ELIGIBLE_IDS]})
          AND ct.type::text IN ('SHOP_PURCHASE', 'SHOP_REFUND', 'DESIGN_APPROVED')) AS eligible_spend
  `
  const projectPending = Number(rows[0]?.project_pending ?? 0)
  const credit = Number(rows[0]?.credit ?? 0)
  const eligibleSpend = Number(rows[0]?.eligible_spend ?? 0)
  return Math.max(0, projectPending) + Math.max(0, credit - eligibleSpend)
}

export { CurrencyTransactionType }
