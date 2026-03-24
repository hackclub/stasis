import type { Metadata } from 'next';
import { projects } from '../projects';

const projectModuleSlugs = [
  'spotify-display',
  'blinky',
  'devboard',
  'split-keyboard',
  'squeak',
];

export function generateStaticParams() {
  return projects
    .filter((p) => projectModuleSlugs.includes(p.id))
    .map((project) => ({ slug: project.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.find((p) => p.id === slug);

  if (!project) {
    return { title: 'Project Not Found - Stasis' };
  }

  return {
    title: `${project.name} - Starter Projects - Stasis`,
    description: project.short_description,
    alternates: {
      canonical: `https://stasis.hackclub.com/starter-projects/${project.id}`,
    },
  };
}

export default function StarterProjectSlugLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
