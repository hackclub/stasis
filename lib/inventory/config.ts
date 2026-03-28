export const MIN_BITS_FOR_INVENTORY = parseInt(
  process.env.MIN_BITS_FOR_INVENTORY ?? "0"
)
export const VENUE_FLOORS = parseInt(process.env.VENUE_FLOORS ?? "3")
export const TOOL_RENTAL_TIME_LIMIT_MINUTES = parseInt(
  process.env.TOOL_RENTAL_TIME_LIMIT_MINUTES ?? "0"
)
export const MAX_TEAM_SIZE = parseInt(process.env.MAX_TEAM_SIZE ?? "4")
export const MAX_CONCURRENT_RENTALS = parseInt(
  process.env.MAX_CONCURRENT_RENTALS ?? "2"
)
