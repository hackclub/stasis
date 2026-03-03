const BADGE_IMAGE_MAP: Record<string, string> = {
  'WiFi': '/badges/WiFi.webp',
  'SPI': '/badges/SPI.webp',
  'I2C': '/badges/I2C.webp',
  'CAD': '/badges/CAD.webp',
  'Bluetooth': '/badges/Bluetooth.webp',
  'MCU': '/badges/MCU-Integration.webp',
  'Displays': '/badges/Displays.webp',
  'Motors': '/badges/Motors.webp',
  'Analog Sensors': '/badges/Analog-Sensors.webp',
  'Digital Sensors': '/badges/Digital-Sensors.webp',
};

export function getBadgeImageUrl(badge: string): string {
  return BADGE_IMAGE_MAP[badge] ?? '';
}

export interface StarterProject {
  id: string;
  name: string;
  hours: number;
  short_description: string;
  badges: string[];
  hasTutorial?: boolean;
  image?: string;
}

export const projects: StarterProject[] = [
  {
    id: 'spotify-display',
    name: 'Spotify Display',
    hours: 8,
    short_description: 'Build a display that shows your currently playing Spotify track with ESP32.',
    badges: ['WiFi', 'SPI', 'CAD'],
    hasTutorial: true,
  },
  {
    id: 'blinky',
    name: 'Blinky Board',
    hours: 5,
    short_description: 'A 555 LED chaser board — a classic beginner PCB project.',
    badges: [],
    hasTutorial: true,
    image: 'blinky.webp',
  },
  {
    id: 'devboard',
    name: 'Devboard',
    hours: 10,
    short_description: 'Design and build your own RP2040 development board.',
    badges: ['SPI', 'I2C', 'MCU'],
    hasTutorial: true,
    image: 'devboard.webp',
  },
  {
    id: 'split-keyboard',
    name: 'Split Keyboard',
    hours: 20,
    short_description: 'Build a wireless split mechanical keyboard from scratch.',
    badges: ['Bluetooth', 'MCU'],
    hasTutorial: true,
  },
  {
    id: 'squeak',
    name: 'Squeak',
    hours: 6,
    short_description: 'Design a custom ergonomic mouse shell in OnShape and get it 3D printed.',
    badges: ['CAD'],
    hasTutorial: true,
    image: 'squeak.webp',
  },
];
