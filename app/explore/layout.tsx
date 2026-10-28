import type { Metadata } from 'next';
import { PlatformNoiseOverlay } from '../components/PlatformNoiseOverlay';
import { ExploreHeader } from './ExploreHeader';

const description = "Hardware projects designed and built by teenagers for Stasis, a Hack Club hackathon. Browse every project's build journal.";

export const metadata: Metadata = {
  title: "Explore Projects | Stasis",
  description,
  alternates: { canonical: "https://stasis.hackclub.com/explore" },
  openGraph: {
    title: "Explore Projects | Stasis",
    description,
    siteName: "Stasis",
    type: "website",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Stasis" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Projects | Stasis",
    description,
    images: ["/og-image.jpg"],
  },
};

export default function ExploreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">
        <ExploreHeader />
        <div className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </div>
      </div>
      <PlatformNoiseOverlay />
    </>
  );
}
