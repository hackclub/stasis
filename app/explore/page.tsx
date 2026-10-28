import { Suspense } from 'react';
import DiscoverGrid from '@/app/components/discover/DiscoverGrid';

export default function ExplorePage() {
  return (
    <Suspense>
      <DiscoverGrid
        basePath="/explore"
        heading="Explore"
        intro={
          <>
            Hardware projects designed and built by teenagers for Stasis, a Hack Club hackathon.
            Every project keeps a public build journal. A green check means reviewers approved the
            design, and <span className="uppercase font-bold">Built</span> means the finished hardware was approved too.
          </>
        }
      />
    </Suspense>
  );
}
