import { BadgeType } from "@/app/generated/prisma/enums"

export const MAX_BADGES_PER_PROJECT = 3

export const AVAILABLE_BADGES: { value: BadgeType; label: string }[] = [
  { value: "I2C", label: "I2C" },
  { value: "SPI", label: "SPI" },
  { value: "WIFI", label: "WiFi" },
  { value: "BLUETOOTH", label: "Bluetooth" },
  { value: "OTHER_RF", label: "Other RF (LoRa, etc.)" },
  { value: "ANALOG_SENSORS", label: "Analog Sensors" },
  { value: "DIGITAL_SENSORS", label: "Digital Sensors" },
  { value: "CAD", label: "CAD" },
  { value: "DISPLAYS", label: "Displays" },
  { value: "MOTORS", label: "Motors" },
  { value: "CAMERAS", label: "Cameras" },
  { value: "METAL_MACHINING", label: "Metal/Machining" },
  { value: "WOOD_FASTENERS", label: "Wood & Fasteners" },
  { value: "MACHINE_LEARNING", label: "Machine Learning" },
  { value: "MCU_INTEGRATION", label: "MCU Integration" },
  { value: "FOUR_LAYER_PCB", label: "4-Layer PCB" },
  { value: "WOODWORKING", label: "Woodworking" },
]

export const VALID_BADGE_TYPES: BadgeType[] = AVAILABLE_BADGES.map(b => b.value)

export const BADGE_LABELS: Record<BadgeType, string> = Object.fromEntries(
  AVAILABLE_BADGES.map(b => [b.value, b.label])
) as Record<BadgeType, string>
