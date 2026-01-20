export const STARTER_PROJECTS = [
  { id: 'hackpad', name: 'Hackpad' },
  { id: 'led-cube', name: 'LED Cube' },
  { id: 'synth-kit', name: 'Synth Kit' },
  { id: 'smart-mirror', name: 'Smart Mirror' },
  { id: 'bot-arm', name: 'Bot Arm' },
  { id: 'mini-drone', name: 'Mini Drone' },
  { id: 'gamepad', name: 'GamePad' },
  { id: 'vu-meter', name: 'VU Meter' },
  { id: 'weather-station', name: 'Weather Station' },
  { id: 'badge-pcb', name: 'Badge PCB' },
] as const;

export const STARTER_PROJECT_NAMES: Record<string, string> = Object.fromEntries(
  STARTER_PROJECTS.map(p => [p.id, p.name])
);
