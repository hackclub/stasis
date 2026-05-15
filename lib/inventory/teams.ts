import prisma from "@/lib/prisma"
import type {
  ManufacturingJobStatus,
  OrderStatus,
  RentalStatus,
} from "@/app/generated/prisma/client"
import { syncTeamChannel } from "./team-channel"

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ["PLACED", "IN_PROGRESS", "READY"]
const ACTIVE_RENTAL_STATUSES: RentalStatus[] = ["PLACED", "IN_PROGRESS", "READY", "CHECKED_OUT", "RETURN_REQUESTED"]
const ACTIVE_MANUFACTURING_STATUSES: ManufacturingJobStatus[] = ["PENDING", "TIME_APPROVAL_REQUESTED", "QUEUED", "PRINTING", "READY"]

export const ACTIVE_TEAM_REQUESTS_ERROR =
  "Cannot leave or delete a team with active inventory or print requests."

/**
 * Remove a user from a team. Deletes the team if no members remain,
 * otherwise syncs the Slack channel.
 */
export async function removeFromTeam(userId: string, teamId: string) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { teamId: null },
    })

    const count = await tx.user.count({ where: { teamId } })
    let deleted = false

    if (count === 0) {
      // Only delete team if no inventory history references it.
      const [
        activeOrderCount,
        activeRentalCount,
        activeManufacturingCount,
        orderCount,
        rentalCount,
        manufacturingCount,
      ] = await Promise.all([
        tx.order.count({ where: { teamId, status: { in: ACTIVE_ORDER_STATUSES } } }),
        tx.toolRental.count({ where: { teamId, status: { in: ACTIVE_RENTAL_STATUSES } } }),
        tx.manufacturingJob.count({ where: { teamId, status: { in: ACTIVE_MANUFACTURING_STATUSES } } }),
        tx.order.count({ where: { teamId } }),
        tx.toolRental.count({ where: { teamId } }),
        tx.manufacturingJob.count({ where: { teamId } }),
      ])

      if (activeOrderCount > 0 || activeRentalCount > 0 || activeManufacturingCount > 0) {
        throw new Error(ACTIVE_TEAM_REQUESTS_ERROR)
      }

      if (orderCount === 0 && rentalCount === 0 && manufacturingCount === 0) {
        await tx.team.delete({ where: { id: teamId } })
        deleted = true
      }
    }
    return { remaining: count, deleted }
  })

  if (result.remaining > 0) {
    syncTeamChannel(teamId).catch(() => {})
  }

  return result
}
