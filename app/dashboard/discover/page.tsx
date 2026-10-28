import { Suspense } from 'react';
import DiscoverGrid from '@/app/components/discover/DiscoverGrid';

export default function DiscoverPage() {
  return (
    <Suspense>
      <DiscoverGrid
        basePath="/dashboard/discover"
        heading="Discover"
        intro="Get inspired by seeing what others are building. Projects with a green checkmark have been approved. These projects are a good example for the level of quality we expect for Stasis projects."
      />
    </Suspense>
  );
}
