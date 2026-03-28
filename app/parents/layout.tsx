import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Parent Guide - Stasis',
  description:
    'Information for parents about Stasis, a Hack Club hardware hackathon for high school students ages 13-18 in Austin, TX.',
  alternates: { canonical: 'https://stasis.hackclub.com/parents' },
};

export default function ParentsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
