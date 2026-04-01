import prisma from "@/lib/prisma"
import { syncTeamChannel } from "./team-channel"

/**
 * Remove a user from a team. Deletes the team if no members remain,
 * otherwise syncs the Slack channel.
 */
export async function removeFromTeam(userId: string, teamId: string) {
  const remaining = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { teamId: null },
    })

    const count = await tx.user.count({ where: { teamId } })

    if (count === 0) {
      // Only delete team if no orders or rentals reference it
      const [orderCount, rentalCount] = await Promise.all([
        tx.order.count({ where: { teamId } }),
        tx.toolRental.count({ where: { teamId } }),
      ])
      if (orderCount === 0 && rentalCount === 0) {
        await tx.team.delete({ where: { id: teamId } })
      }
    }
    return count
  })

  if (remaining > 0) {
    syncTeamChannel(teamId).catch(() => {})
  }
}
