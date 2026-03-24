import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Starter Projects - Stasis',
  description:
    'Beginner-friendly hardware starter projects for Stasis: Spotify Display, Blinky Board, Devboard, Split Keyboard, and more.',
  alternates: { canonical: 'https://stasis.hackclub.com/starter-projects' },
};

export default function StarterProjectsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
