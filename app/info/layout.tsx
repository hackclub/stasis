import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Event Info - Stasis',
  description:
    'Everything you need to know about Stasis, the high school hardware hackathon in Austin, TX on May 15-18. Guides, rules, and resources.',
  alternates: { canonical: 'https://stasis.hackclub.com/info' },
};

export default function InfoLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
