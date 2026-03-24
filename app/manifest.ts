import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Stasis - High School Hardware Hackathon',
    short_name: 'Stasis',
    description: 'A High School Hardware Hackathon in Austin, TX on May 15-18',
    start_url: '/',
    display: 'standalone',
    background_color: '#2A2318',
    theme_color: '#C4B9A2',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
