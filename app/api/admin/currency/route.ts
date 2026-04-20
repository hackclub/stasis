import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { appendLedgerEntry, CurrencyTransactionType } from "@/lib/currency"

/**
 * GET /api/admin/currency
 *
 * Returns all ledger entries, newest first.
 * Optional query params:
 *   ?userId=<id>   filter to a specific user
 *   ?limit=<n>     default 100, max 500
 *   ?offset=<n>    for pagination
 */
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const { searchParams } = new URL(request.url)
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10)))
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10))
  let userId = searchParams.get("userId") ?? undefined

  // Allow filtering by email — resolve to userId
  if (userId && userId.includes("@")) {
    const user = await prisma.user.findUnique({ where: { email: userId }, select: { id: true } })
    if (!user) {
      return NextResponse.json({ entries: [], total: 0, limit, offset })
    }
    userId = user.id
  }

  const [entries, total] = await Promise.all([
    prisma.currencyTransaction.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.currencyTransaction.count({
      where: userId ? { userId } : undefined,
    }),
  ])

  return NextResponse.json({ entries, total, limit, offset })
}

/**
 * POST /api/admin/currency
 *
 * Creates a manual credit or debit ledger entry for a user.
 * Body: { userId, amount, note }
 *   amount > 0  → ADMIN_GRANT
 *   amount < 0  → ADMIN_DEDUCTION
 */
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission(Permission.MANAGE_CURRENCY)
  if (authCheck.error) return authCheck.error

  const body = await request.json()
  const { userId: userIdOrEmail, amount, note } = body

  if (typeof userIdOrEmail !== "string" || !userIdOrEmail) {
    return NextResponse.json({ error: "userId or email is required" }, { status: 400 })
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0) {
    return NextResponse.json({ error: "amount must be a non-zero integer" }, { status: 400 })
  }
  if (note !== undefined && typeof note !== "string") {
    return NextResponse.json({ error: "note must be a string" }, { status: 400 })
  }

  // Resolve email to user ID if input contains @
  const user = userIdOrEmail.includes("@")
    ? await prisma.user.findUnique({ where: { email: userIdOrEmail }, select: { id: true } })
    : await prisma.user.findUnique({ where: { id: userIdOrEmail }, select: { id: true } })
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }
  const userId = user.id

  const type = amount > 0 ? CurrencyTransactionType.ADMIN_GRANT : CurrencyTransactionType.ADMIN_DEDUCTION

  const entry = await prisma.$transaction(async (tx) => {
    return appendLedgerEntry(tx, {
      userId,
      amount,
      type,
      note: typeof note === "string" ? note.trim() || undefined : undefined,
      createdBy: authCheck.session.user.id,
    })
  })

  return NextResponse.json(entry, { status: 201 })
}
