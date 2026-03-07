import { Suspense } from 'react';
import { HomeContent } from '../page';

export default function OpenSaucePage() {
  return (
    <Suspense>
      <HomeContent event="opensauce" skipRedirect />
    </Suspense>
  );
}
