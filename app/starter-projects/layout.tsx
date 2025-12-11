import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Starter Projects - Stasis',
};

export default function StarterProjectsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
