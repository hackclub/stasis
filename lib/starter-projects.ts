import { projects } from '@/app/starter-projects/projects';

// Tier assignments for each starter project (hardcoded based on project complexity)
const TIER_MAP: Record<string, number> = {
  'blinky': 1,
  'squeak': 2,
  'spotify-display': 2,
  'devboard': 3,
  'split-keyboard': 3,
};

export const STARTER_PROJECTS = projects.map(p => ({
  id: p.id,
  name: p.name,
  tier: TIER_MAP[p.id] ?? 2,
}));

export const STARTER_PROJECT_NAMES: Record<string, string> = Object.fromEntries(
  STARTER_PROJECTS.map(p => [p.id, p.name])
);
