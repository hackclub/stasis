import { projects } from '@/app/starter-projects/projects';

// Tier assignments for each starter project (hardcoded based on project complexity)
const TIER_MAP: Record<string, number> = {
  'blinky': 1,
  'squeak': 1,
  'spotify-display': 1,
  'devboard': 2,
  'split-keyboard': 2,
  'meshtastic-lora': 2,
  'pathfinder': 1,
  'hermes': 1,
};

export const STARTER_PROJECTS = projects.map(p => ({
  id: p.id,
  name: p.name,
  tier: TIER_MAP[p.id] ?? 2,
}));

export const STARTER_PROJECT_NAMES: Record<string, string> = Object.fromEntries(
  STARTER_PROJECTS.map(p => [p.id, p.name])
);
