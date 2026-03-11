// ============================================================
// PROJECT TIER SYSTEM CONFIGURATION
// All tier values are centralized here for easy adjustment.
// 1 bit = $1 value
//
// Based on the tier of your project, you earn a certain number of bits.
// You can spend at most 50% of your earned bits on parts (BIT_SPEND_RATIO).
// The remaining 50% (bits earned - bits spent on parts) goes toward
// your qualification total.
// ============================================================

// The maximum fraction of earned bits that can be spent on parts.
// e.g. a Tier 1 project earns 50 bits → max 25 bits ($25) can be spent on parts,
// and at least 25 bits go toward qualification.
export const BIT_SPEND_RATIO = 0.5

// --- Tier Definitions ---
// Tiers are ordered from lowest (Tier 1) to highest (Tier 5).
// bits: fixed allocation per project at this tier
// minHours / maxHours: hour range for projects at this tier
// examples: example projects at this tier
export const TIERS = [
  {
    id: 1,
    name: "Complexity Tier 1",
    bits: 50,
    minHours: 5,
    maxHours: 8,
    examples: ["Phone Stand", "3D Printed Trinket", "PCB Fidget"],
  },
  {
    id: 2,
    name: "Complexity Tier 2",
    bits: 100,
    minHours: 8,
    maxHours: 16,
    examples: ["Drone Kit", "LED Lamp", "Custom Macropad"],
  },
  {
    id: 3,
    name: "Complexity Tier 3",
    bits: 200,
    minHours: 17,
    maxHours: 33,
    examples: ["Game Console", "Devboard", "Keyboard"],
  },
  {
    id: 4,
    name: "Complexity Tier 4",
    bits: 400,
    minHours: 34,
    maxHours: 66,
    examples: ["Battle Bot", "Custom Robot Arm", "FPGA Board"],
  },
  {
    id: 5,
    name: "Complexity Tier 5",
    bits: 600,
    minHours: 67,
    maxHours: Infinity,
    examples: ["VVVF Inverter", "Custom CNC Machine", "Satellite Ground Station"],
  },
] as const

export type TierId = (typeof TIERS)[number]["id"]
export type Tier = (typeof TIERS)[number]

// --- Qualification Thresholds ---
// Total bits a user must earn (from project profits) to qualify.
export const QUALIFICATION_BITS_THRESHOLD = 350

// Event-specific thresholds
export const EVENT_THRESHOLDS = {
  stasis: 350,
  opensauce: 250,
} as const

export type EventPreference = keyof typeof EVENT_THRESHOLDS

export const EVENT_LABELS: Record<EventPreference, string> = {
  stasis: 'Stasis',
  opensauce: 'Open Sauce',
}

/** Get the qualification threshold for a given event preference. */
export function getEventThreshold(event: EventPreference | null | undefined): number {
  return EVENT_THRESHOLDS[event ?? 'stasis']
}

// --- Helpers ---

/** Get a tier by ID, or undefined if not found. */
export function getTierById(id: number): Tier | undefined {
  return TIERS.find((t) => t.id === id)
}

/** Get all tiers sorted from lowest to highest. */
export function getTiersSorted(): readonly Tier[] {
  return TIERS
}

/**
 * Get the fixed bits allocation for a given tier (before BOM deduction).
 */
export function getTierBits(tierId: number): number {
  const tier = getTierById(tierId)
  if (!tier) return 0
  return tier.bits
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
