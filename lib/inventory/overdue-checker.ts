import prisma from "@/lib/prisma"
import { notifyRental } from "./notifications"

const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let started = false
const notifiedRentals = new Set<string>()

export function startOverdueChecker() {
  if (started) return
  started = true

  setInterval(async () => {
    try {
      const overdueRentals = await prisma.toolRental.findMany({
        where: {
          status: "CHECKED_OUT",
          dueAt: { lt: new Date() },
        },
        include: {
          tool: { select: { name: true } },
          team: { select: { id: true, name: true } },
        },
      })

      for (const rental of overdueRentals) {
        if (notifiedRentals.has(rental.id)) continue
        notifiedRentals.add(rental.id)
        notifyRental(
          rental.teamId,
          rental.tool.name,
          "Rental Overdue",
          `Due at ${rental.dueAt!.toLocaleString()}. Please return it to the hardware station.`
        )
      }

      // Clean up returned rentals from the set
      const overdueIds = new Set(overdueRentals.map((r) => r.id))
      for (const id of notifiedRentals) {
        if (!overdueIds.has(id)) notifiedRentals.delete(id)
      }
    } catch (err) {
      console.error("[OverdueChecker] Error checking overdue rentals:", err)
    }
  }, CHECK_INTERVAL_MS)
}
