import { ProjectTag } from "@/app/generated/prisma/enums"

export const AVAILABLE_TAGS: { value: ProjectTag; label: string }[] = [
  { value: "PCB", label: "PCB" },
  { value: "ROBOT", label: "Robot" },
  { value: "CAD", label: "CAD" },
  { value: "ARDUINO", label: "Arduino" },
  { value: "RASPBERRY_PI", label: "Raspberry Pi" },
  { value: "THREE_D_PRINT", label: "3D Print" },
  { value: "LASER_CUT", label: "Laser Cut" },
  { value: "IOT", label: "IoT" },
  { value: "WEARABLE", label: "Wearable" },
  { value: "AUDIO", label: "Audio" },
  { value: "LED", label: "LED" },
  { value: "DRONE", label: "Drone" },
  { value: "SENSOR", label: "Sensor" },
  { value: "WIRELESS", label: "Wireless" },
  { value: "MOTOR", label: "Motor" },
  { value: "DISPLAY", label: "Display" },
  { value: "BATTERY", label: "Battery" },
  { value: "SOLAR", label: "Solar" },
  { value: "KEYBOARD", label: "Keyboard" },
  { value: "GAME_CONSOLE", label: "Game Console" },
  { value: "HOME_AUTOMATION", label: "Home Auto" },
  { value: "WEATHER_STATION", label: "Weather Station" },
  { value: "CNC", label: "CNC" },
]

export const TAG_LABELS: Record<ProjectTag, string> = Object.fromEntries(
  AVAILABLE_TAGS.map((t) => [t.value, t.label])
) as Record<ProjectTag, string>

export const VALID_TAGS: ProjectTag[] = AVAILABLE_TAGS.map((t) => t.value)
