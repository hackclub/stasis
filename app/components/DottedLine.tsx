'use client';

import { useState, useEffect } from 'react';

type Orientation = 'horizontal' | 'vertical';

type Props = Readonly<{
  orientation?: Orientation;
}>;

export function DottedLine({ orientation = 'horizontal' }: Props) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(Math.random() * 1202);
  }, []);

  return (
    <div
      className={`absolute -z-2 z-50 ${orientation} ${orientation === 'vertical' ? 'w-px h-full' : 'h-px w-full'}`}
      style={{
        backgroundRepeat: 'repeat',
        imageRendering: 'pixelated',
        filter: 'brightness(98%) saturate(95%)',
        backgroundImage: `url('/dotted-line${orientation === 'vertical' ? '-vertical' : ''}.svg')`,
        backgroundPosition: orientation === 'horizontal' ? `${offset}px 0` : undefined,
      }}
    />
  );
}
