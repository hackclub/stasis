// ============================================================
// PROJECT TIER SYSTEM CONFIGURATION
// All tier values are centralized here for easy adjustment.
// 1 bit = $1 value
//
// Based on the tier of your project, you earn a certain number of bits.
// You must spend 1 bit per dollar to buy parts.
// The profit (bits earned - bits spent) goes toward a 350-bit
// qualification requirement.
// ============================================================

// --- Tier Definitions ---
// Tiers are ordered from highest (Tier 1) to lowest (Tier 4).
// bits: fixed allocation per project at this tier
// minHours / maxHours: hour range for projects at this tier
// examples: example projects at this tier
// flightStipend: estimated flight stipend (~$10/hour at midpoint of hour range)

export const TIERS = [
  {
    id: 1,
    name: "Tier 1",
    bits: 200,
    minHours: 20,
    maxHours: 40,
    examples: ["battle bot", "custom robot arm", "FPGA board"],
    flightStipend: 300,
  },
  {
    id: 2,
    name: "Tier 2",
    bits: 100,
    minHours: 10,
    maxHours: 20,
    examples: ["game console", "devboard", "keyboard"],
    flightStipend: 150,
  },
  {
    id: 3,
    name: "Tier 3",
    bits: 50,
    minHours: 5,
    maxHours: 10,
    examples: ["drone kit", "LED lamp", "custom macropad"],
    flightStipend: 75,
  },
  {
    id: 4,
    name: "Tier 4",
    bits: 25,
    minHours: 3,
    maxHours: 5,
    examples: ["phone stand", "3D printed trinket", "PCB fidget toy"],
    flightStipend: 40,
  },
] as const

export type TierId = (typeof TIERS)[number]["id"]
export type Tier = (typeof TIERS)[number]

// --- Qualification Thresholds ---
// Total bits a user must earn (from project profits) to qualify.
export const QUALIFICATION_BITS_THRESHOLD = 350

// --- Helpers ---

/** Get a tier by ID, or undefined if not found. */
export function getTierById(id: number): Tier | undefined {
  return TIERS.find((t) => t.id === id)
}

/** Get all tiers sorted from highest to lowest. */
export function getTiersSorted(): readonly Tier[] {
  return TIERS
}

/**
 * Get the bits earned for a project at a given tier.
 * The actual profit per project is tier.bits minus the BOM cost (tracked elsewhere).
 */
export function calculateProjectProfit(tierId: number): number {
  const tier = getTierById(tierId)
  if (!tier) return 0
  return tier.bits
}

/**
 * Estimate how many projects at a given tier are needed to reach qualification.
 * Based on tier bits directly (actual profit depends on per-project BOM costs).
 */
export function projectsToQualify(tierId: number): number {
  const bits = calculateProjectProfit(tierId)
  if (bits <= 0) return Infinity
  return Math.ceil(QUALIFICATION_BITS_THRESHOLD / bits)
}

/**
 * Check whether a user's total earned bits meet the qualification threshold.
 */
export function isQualified(totalBitsEarned: number): boolean {
  return totalBitsEarned >= QUALIFICATION_BITS_THRESHOLD
}

/**
 * Get the qualification progress as a 0–1 fraction.
 */
export function qualificationProgress(totalBitsEarned: number): number {
  return Math.min(1, totalBitsEarned / QUALIFICATION_BITS_THRESHOLD)
}
