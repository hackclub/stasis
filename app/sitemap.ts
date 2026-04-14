import type { MetadataRoute } from 'next';
import { projects } from '@/app/starter-projects/projects';

const BASE_URL = 'https://stasis.hackclub.com';

const projectModuleSlugs = [
  'spotify-display',
  'blinky',
  'devboard',
  'split-keyboard',
  'squeak',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const starterProjectEntries: MetadataRoute.Sitemap = projects
    .filter((p) => projectModuleSlugs.includes(p.id))
    .map((project) => ({
      url: `${BASE_URL}/starter-projects/${project.id}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }));

  return [
    {
      url: BASE_URL,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/info`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/parents`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/schedule`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/help`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/starter-projects`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...starterProjectEntries,
    {
      url: `${BASE_URL}/sidekick`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
