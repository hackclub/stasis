function safeInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? String(fallback))
  return Number.isFinite(parsed) ? parsed : fallback
}

export const MIN_BITS_FOR_INVENTORY = safeInt(
  process.env.MIN_BITS_FOR_INVENTORY, 0
)
export const VENUE_FLOORS = safeInt(process.env.VENUE_FLOORS, 3)
export const TOOL_RENTAL_TIME_LIMIT_MINUTES = safeInt(
  process.env.TOOL_RENTAL_TIME_LIMIT_MINUTES, 0
)
export const MAX_TEAM_SIZE = safeInt(process.env.MAX_TEAM_SIZE, 4)
export const MAX_CONCURRENT_RENTALS = safeInt(
  process.env.MAX_CONCURRENT_RENTALS, 2
)
