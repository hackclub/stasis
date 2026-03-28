import { sanitize } from "@/lib/sanitize"
import { VENUE_FLOORS } from "./config"

const MAX_NAME_LENGTH = 100
const MAX_LOCATION_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 2000

export function sanitizeName(input: string): string {
  return sanitize(input).trim().slice(0, MAX_NAME_LENGTH)
}

export function sanitizeLocation(input: string): string {
  return sanitize(input).trim().slice(0, MAX_LOCATION_LENGTH)
}

export function sanitizeDescription(input: string): string {
  return sanitize(input).trim().slice(0, MAX_DESCRIPTION_LENGTH)
}

export function validateFloor(floor: unknown): floor is number {
  return (
    typeof floor === "number" &&
    Number.isInteger(floor) &&
    floor >= 1 &&
    floor <= VENUE_FLOORS
  )
}

export function validatePositiveInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    Number.isFinite(value)
  )
}

export function validateNonNegativeInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    Number.isFinite(value)
  )
}

/**
 * Validate that a URL is an HTTPS URL (or null/empty).
 * Rejects javascript:, data:, and non-https schemes.
 */
export function validateImageUrl(url: unknown): string | null {
  if (url === null || url === undefined || url === "") return null
  if (typeof url !== "string") return null
  const trimmed = url.trim()
  if (trimmed === "") return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== "https:") return null
    return trimmed
  } catch {
    return null
  }
}
