export interface StarterProject {
  id: string;
  name: string;
  hours: number;
  short_description: string;
  badges: string[];
  hasTutorial?: boolean;
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
    id: 'led-cube',
    name: 'LED Cube',
    hours: 8,
    short_description: 'A 3D LED display controlled by Arduino.',
    badges: [],
  },
  {
    id: 'synth-kit',
    name: 'Synth Kit',
    hours: 10,
    short_description: 'Build a DIY analog synthesizer from scratch.',
    badges: [],
  },
  {
    id: 'smart-mirror',
    name: 'Smart Mirror',
    hours: 12,
    short_description: 'A Raspberry Pi powered two-way mirror.',
    badges: [],
  },
  {
    id: 'bot-arm',
    name: 'Bot Arm',
    hours: 15,
    short_description: 'A 3D printed robotic arm with servo control.',
    badges: [],
  },
  {
    id: 'mini-drone',
    name: 'Mini Drone',
    hours: 20,
    short_description: 'A custom quadcopter with FPV camera.',
    badges: [],
  },
  {
    id: 'gamepad',
    name: 'GamePad',
    hours: 7,
    short_description: 'A wireless controller for retro gaming.',
    badges: [],
  },
  {
    id: 'vu-meter',
    name: 'VU Meter',
    hours: 5,
    short_description: 'An audio visualizer with RGB LEDs.',
    badges: [],
  },
  {
    id: 'weather-station',
    name: 'Weather Station',
    hours: 9,
    short_description: 'Track temperature, humidity, and pressure.',
    badges: [],
  },
];
