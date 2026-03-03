'use client';

import { Suspense } from 'react';
import { HomeContent } from '../page';

export default function LandingPage() {
  return (
    <Suspense>
      <HomeContent skipRedirect />
    </Suspense>
  );
}
