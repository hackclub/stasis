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
    if (asteroidCatRef.current) {
      window.__stasisAsteroidCat = asteroidCatRef.current;
    }
    return () => {
      delete window.__stasisAsteroidCat;
    };
  }, []);

  return <AsteroidCat ref={asteroidCatRef} />;
}
