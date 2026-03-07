'use client';

import { Suspense } from 'react';
import { HomeContent } from '../page';

export default function OpenSaucePage() {
  return (
    <Suspense>
      <HomeContent signupPage="Open Sauce" />
    </Suspense>
  );
}
