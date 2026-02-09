'use client';

import { useEffect, useRef } from 'react';
import AsteroidCat, { AsteroidCatRef } from './AsteroidCat';

declare global {
  interface Window {
    __stasisAsteroidCat?: AsteroidCatRef;
  }
}

export default function AsteroidCatWrapper() {
  const asteroidCatRef = useRef<AsteroidCatRef>(null);

  useEffect(() => {
    window.__stasisAsteroidCat = {
      trigger: () => asteroidCatRef.current?.trigger()
    };
    return () => {
      delete window.__stasisAsteroidCat;
    };
  }, []);

  return <AsteroidCat ref={asteroidCatRef} />;
}
