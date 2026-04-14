import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Schedule - Stasis',
  description:
    'Event schedule for Stasis, a Hack Club hardware hackathon for high school students, May 15-18 2026 in Austin, TX.',
  alternates: { canonical: 'https://stasis.hackclub.com/schedule' },
};

export default function ScheduleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
