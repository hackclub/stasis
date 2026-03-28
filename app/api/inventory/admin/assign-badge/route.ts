import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"

export async function POST(request: Request) {
  const result = await requireAdmin()
  if ("error" in result) return result.error

  const body = await request.json()
  const { userId, nfcId } = body

  if (!userId || !nfcId) {
    return NextResponse.json(
      { error: "userId and nfcId are required" },
      { status: 400 }
    )
  }

  // Check if this nfcId is already assigned to someone else
  const existing = await prisma.user.findUnique({ where: { nfcId } })
  if (existing && existing.id !== userId) {
    return NextResponse.json(
      { error: "This badge is already assigned to another user" },
      { status: 409 }
    )
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { nfcId },
    select: { id: true, name: true, slackDisplayName: true, nfcId: true },
  })

  return NextResponse.json(user)
}
