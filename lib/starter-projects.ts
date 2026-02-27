export const STARTER_PROJECTS = [
  { id: 'led-cube', name: 'LED Cube', tier: 4 },
  { id: 'synth-kit', name: 'Synth Kit', tier: 3 },
  { id: 'smart-mirror', name: 'Smart Mirror', tier: 3 },
  { id: 'bot-arm', name: 'Bot Arm', tier: 3 },
  { id: 'mini-drone', name: 'Mini Drone', tier: 3 },
  { id: 'gamepad', name: 'GamePad', tier: 4 },
  { id: 'vu-meter', name: 'VU Meter', tier: 4 },
  { id: 'weather-station', name: 'Weather Station', tier: 4 },
  { id: 'badge-pcb', name: 'Badge PCB', tier: 5 },
] as const;

export const STARTER_PROJECT_NAMES: Record<string, string> = Object.fromEntries(
  STARTER_PROJECTS.map(p => [p.id, p.name])
);
