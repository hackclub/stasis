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
]

export const VALID_BADGE_TYPES: BadgeType[] = AVAILABLE_BADGES.map(b => b.value)

export const BADGE_LABELS: Record<BadgeType, string> = Object.fromEntries(
  AVAILABLE_BADGES.map(b => [b.value, b.label])
) as Record<BadgeType, string>

export const BADGE_IMAGES: Record<string, string> = {
  I2C: "/badges/I2C.webp",
  SPI: "/badges/SPI.webp",
  WIFI: "/badges/WiFi.webp",
  BLUETOOTH: "/badges/Bluetooth.webp",
  OTHER_RF: "/badges/Other-RF.webp",
  ANALOG_SENSORS: "/badges/Analog-Sensors.webp",
  DIGITAL_SENSORS: "/badges/Digital-Sensors.webp",
  CAD: "/badges/CAD.webp",
  DISPLAYS: "/badges/Displays.webp",
  MOTORS: "/badges/Motors.webp",
  CAMERAS: "/badges/Cameras.webp",
  METAL_MACHINING: "/badges/Metal-Machining.webp",
  WOOD_FASTENERS: "/badges/Wood-and-Fasteners.webp",
  MACHINE_LEARNING: "/badges/Neural-Networks.webp",
  MCU_INTEGRATION: "/badges/MCU-Integration.webp",
  FOUR_LAYER_PCB: "/badges/4-layer.webp",
}

export function getBadgeImage(badge: string): string {
  return BADGE_IMAGES[badge] || "/badge-placeholder.png"
}
