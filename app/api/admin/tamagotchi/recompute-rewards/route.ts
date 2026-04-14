import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requirePermission } from "@/lib/admin-auth"
import { Permission } from "@/lib/permissions"
import { TAMAGOTCHI_EVENT } from "@/lib/tamagotchi"
import { checkAndCreateStreakReward } from "@/lib/tamagotchi-reward"

/**
 * POST /api/admin/tamagotchi/recompute-rewards
 *
 * Batch-recompute StreakRewards for all users who have work sessions in the
 * event window but don't yet have a StreakReward. Handles the case where
 * users completed the challenge but never loaded the dashboard to trigger
 * the lazy creation.
 */
export async function POST() {
  const authCheck = await requirePermission(Permission.MANAGE_USERS)
  if (authCheck.error) return authCheck.error

  const fetchStart = new Date(TAMAGOTCHI_EVENT.START + "T00:00:00Z")
  fetchStart.setUTCDate(fetchStart.getUTCDate() - 1)
  const fetchEnd = new Date(TAMAGOTCHI_EVENT.END + "T00:00:00Z")
  fetchEnd.setUTCDate(fetchEnd.getUTCDate() + 2)

  // Find users who have sessions in the event window but no StreakReward yet
  const candidates = await prisma.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT p."userId"
    FROM work_session ws
    JOIN project p ON p.id = ws."projectId"
    WHERE ws."createdAt" >= ${fetchStart}
      AND ws."createdAt" < ${fetchEnd}
      AND ws.content IS NOT NULL
      AND TRIM(ws.content) <> ''
      AND p."userId" NOT IN (SELECT "userId" FROM streak_reward)
  `

  let created = 0
  const errors: string[] = []

  for (const { userId } of candidates) {
    try {
      const reward = await checkAndCreateStreakReward(userId)
      if (reward) created++
    } catch (err) {
      errors.push(`${userId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({
    candidatesChecked: candidates.length,
    rewardsCreated: created,
    errors: errors.length > 0 ? errors : undefined,
  })
}
