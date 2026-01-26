import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { sanitize } from "@/lib/sanitize"
import { XPTransactionType } from "@/app/generated/prisma/enums"

const VALID_TYPES: XPTransactionType[] = [
  "JOURNAL_ENTRY",
  "STREAK_BONUS",
  "EVENT_BONUS",
]

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })

  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { userId, amount, type, description } = body

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 })
  }

  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number" },
      { status: 400 }
    )
  }

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 }
    )
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  })

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.xPTransaction.create({
      data: {
        userId,
        amount,
        type,
        description: description ? sanitize(description) : null,
      },
    })

    await tx.userXP.upsert({
      where: { userId },
      create: {
        userId,
        totalXP: amount,
      },
      update: {
        totalXP: { increment: amount },
      },
    })

    return transaction
  })

  return NextResponse.json(result)
}
