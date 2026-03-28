import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * POST /api/tamagotchi/claim
 *
 * Mark the Tamagotchi Streak Challenge reward as claimed by the user.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id

  const reward = await prisma.streakReward.findUnique({ where: { userId } })
  if (!reward) {
    return NextResponse.json({ error: "No completed challenge found" }, { status: 404 })
  }

  if (reward.claimed) {
    return NextResponse.json({ ok: true, alreadyClaimed: true })
  }

  await prisma.streakReward.update({
    where: { userId },
    data: { claimed: true },
  })

  return NextResponse.json({ ok: true })
}
