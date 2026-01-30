import prisma from "@/lib/prisma"
import { CurrencyTransactionType, Prisma } from "../app/generated/prisma/client"

// Currency name - change this when you decide on a name
export const CURRENCY_NAME = "CURRENCY_NAME"

// Conversion rate: 10 currency per 1 hour
export const CURRENCY_PER_HOUR = 10

// Threshold: users must have 10 approved build hours before earning currency
export const BUILD_HOURS_THRESHOLD = 10

/**
 * Gets the total approved build hours for a user across all projects with approved design.
 * Only counts BUILD stage sessions from projects where design is approved.
 */
export async function getTotalApprovedBuildHours(userId: string): Promise<number> {
  const result = await prisma.workSession.aggregate({
    where: {
      project: {
        userId,
        designStatus: "approved",
      },
      stage: "BUILD",
      hoursApproved: { not: null },
    },
    _sum: {
      hoursApproved: true,
    },
  })

  return result._sum.hoursApproved ?? 0
}

/**
 * Gets or creates a user's currency balance record.
 */
export async function getOrCreateCurrencyBalance(
  userId: string,
  tx?: Prisma.TransactionClient
) {
  const client = tx ?? prisma
  
  let balance = await client.userCurrencyBalance.findUnique({
    where: { userId },
  })

  if (!balance) {
    balance = await client.userCurrencyBalance.create({
      data: { userId },
    })
  }

  return balance
}

/**
 * Gets or creates a user's currency balance record with a row lock (FOR UPDATE).
 * Use this within transactions where you need to prevent race conditions.
 */
async function getOrCreateCurrencyBalanceWithLock(
  userId: string,
  tx: Prisma.TransactionClient
) {
  // First ensure the record exists
  await tx.userCurrencyBalance.upsert({
    where: { userId },
    create: { userId },
    update: {},
  })

  // Then lock and fetch it using FOR UPDATE
  const [balance] = await tx.$queryRaw<Array<{
    id: string
    userId: string
    balance: number
    totalEarned: number
    totalSpent: number
    totalBuildHoursEarned: number
    createdAt: Date
    updatedAt: Date
  }>>`
    SELECT * FROM "UserCurrencyBalance"
    WHERE "userId" = ${userId}
    FOR UPDATE
  `

  return balance
}

/**
 * Calculates how many hours are eligible for currency conversion.
 * Returns hours beyond the 10-hour threshold that haven't been converted yet.
 */
export function calculateConvertibleHours(
  totalApprovedBuildHours: number,
  alreadyConvertedHours: number
): number {
  // Hours beyond threshold
  const hoursAfterThreshold = Math.max(0, totalApprovedBuildHours - BUILD_HOURS_THRESHOLD)
  // Subtract already converted hours
  const newConvertibleHours = hoursAfterThreshold - alreadyConvertedHours
  return Math.max(0, newConvertibleHours)
}

/**
 * Internal implementation for awarding currency within a transaction.
 * Acquires a row lock on the user's balance to prevent race conditions.
 */
export async function awardCurrencyForBuildHoursInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  workSessionId?: string,
  projectId?: string
): Promise<{ currencyAwarded: number; hoursConverted: number } | null> {
  // Lock the balance row first to prevent race conditions
  // This ensures concurrent requests serialize on this user's balance
  const balanceRecord = await getOrCreateCurrencyBalanceWithLock(userId, tx)
  
  // Get user's total approved build hours
  const totalApprovedHours = await getTotalApprovedBuildHoursInTx(tx, userId)
  
  // Calculate how many NEW hours are convertible
  const convertibleHours = calculateConvertibleHours(
    totalApprovedHours,
    balanceRecord.totalBuildHoursEarned
  )

  if (convertibleHours <= 0) {
    return null
  }

  // Calculate currency to award
  const currencyToAward = Math.floor(convertibleHours * CURRENCY_PER_HOUR)

  if (currencyToAward <= 0) {
    return null
  }

  // Create ledger entry
  await tx.currencyTransaction.create({
    data: {
      userId,
      amount: currencyToAward,
      type: CurrencyTransactionType.BUILD_HOURS_CONVERSION,
      balanceBefore: balanceRecord.balance,
      balanceAfter: balanceRecord.balance + currencyToAward,
      description: `Converted ${convertibleHours.toFixed(2)} build hours to ${currencyToAward} ${CURRENCY_NAME}`,
      workSessionId,
      projectId,
      hoursConverted: convertibleHours,
    },
  })

  // Update balance
  await tx.userCurrencyBalance.update({
    where: { userId },
    data: {
      balance: { increment: currencyToAward },
      totalEarned: { increment: currencyToAward },
      totalBuildHoursEarned: { increment: convertibleHours },
    },
  })

  return {
    currencyAwarded: currencyToAward,
    hoursConverted: convertibleHours,
  }
}

/**
 * Awards currency to a user for approved build hours.
 * This should be called when build hours are approved (either individually or via project approval).
 * The function queries the database for total approved hours, so it's idempotent.
 * 
 * For use within an existing transaction, use `awardCurrencyForBuildHoursInTx` instead.
 * 
 * @param userId - The user to award currency to
 * @param workSessionId - Optional work session ID for traceability
 * @param projectId - Optional project ID for traceability
 * @returns The currency transaction if any was created, null if not eligible
 */
export async function awardCurrencyForBuildHours(
  userId: string,
  workSessionId?: string,
  projectId?: string
): Promise<{ currencyAwarded: number; hoursConverted: number } | null> {
  return await prisma.$transaction(async (tx) => {
    return awardCurrencyForBuildHoursInTx(tx, userId, workSessionId, projectId)
  })
}

/**
 * Spend currency (for shop purchases).
 * Returns the transaction if successful, throws error if insufficient balance.
 */
export async function spendCurrency(
  userId: string,
  amount: number,
  description: string,
  shopItemId?: string
): Promise<{ success: boolean; newBalance: number }> {
  if (amount <= 0) {
    throw new Error("Amount must be positive")
  }

  return await prisma.$transaction(async (tx) => {
    const balanceRecord = await getOrCreateCurrencyBalance(userId, tx)

    if (balanceRecord.balance < amount) {
      throw new Error(`Insufficient ${CURRENCY_NAME} balance`)
    }

    const newBalance = balanceRecord.balance - amount

    // Create ledger entry
    await tx.currencyTransaction.create({
      data: {
        userId,
        amount: -amount, // Negative for spending
        type: CurrencyTransactionType.SHOP_PURCHASE,
        balanceBefore: balanceRecord.balance,
        balanceAfter: newBalance,
        description,
        shopItemId,
      },
    })

    // Update balance
    await tx.userCurrencyBalance.update({
      where: { userId },
      data: {
        balance: newBalance,
        totalSpent: { increment: amount },
      },
    })

    return { success: true, newBalance }
  })
}

/**
 * Admin adjustment of currency balance.
 */
export async function adminAdjustCurrency(
  userId: string,
  amount: number,
  description: string,
  adminUserId: string
): Promise<{ newBalance: number }> {
  return await prisma.$transaction(async (tx) => {
    const balanceRecord = await getOrCreateCurrencyBalance(userId, tx)

    const newBalance = balanceRecord.balance + amount

    if (newBalance < 0) {
      throw new Error("Adjustment would result in negative balance")
    }

    // Create ledger entry
    await tx.currencyTransaction.create({
      data: {
        userId,
        amount,
        type: CurrencyTransactionType.ADMIN_ADJUSTMENT,
        balanceBefore: balanceRecord.balance,
        balanceAfter: newBalance,
        description,
        adjustedByUserId: adminUserId,
      },
    })

    // Update balance
    await tx.userCurrencyBalance.update({
      where: { userId },
      data: {
        balance: newBalance,
        totalEarned: amount > 0 ? { increment: amount } : undefined,
        totalSpent: amount < 0 ? { increment: Math.abs(amount) } : undefined,
      },
    })

    return { newBalance }
  })
}

/**
 * Get a user's currency balance.
 */
export async function getCurrencyBalance(userId: string): Promise<{
  balance: number
  totalEarned: number
  totalSpent: number
  totalBuildHoursEarned: number
}> {
  const record = await prisma.userCurrencyBalance.findUnique({
    where: { userId },
  })

  return {
    balance: record?.balance ?? 0,
    totalEarned: record?.totalEarned ?? 0,
    totalSpent: record?.totalSpent ?? 0,
    totalBuildHoursEarned: record?.totalBuildHoursEarned ?? 0,
  }
}

/**
 * Get currency transaction history for a user.
 */
export async function getCurrencyTransactions(
  userId: string,
  limit = 50,
  offset = 0
) {
  return prisma.currencyTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  })
}

// Helper to get total approved build hours within a transaction
async function getTotalApprovedBuildHoursInTx(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  const result = await tx.workSession.aggregate({
    where: {
      project: {
        userId,
        designStatus: "approved",
      },
      stage: "BUILD",
      hoursApproved: { not: null },
    },
    _sum: {
      hoursApproved: true,
    },
  })

  return result._sum.hoursApproved ?? 0
}
