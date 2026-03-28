'use client';

import { useRef, useLayoutEffect, useEffect, useState, type ReactNode, type CSSProperties } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /** Extra styles applied to the outer wrapper (e.g. positioning) */
  style?: CSSProperties;
  /** Transition duration in ms */
  duration?: number;
  /** Also animate top/left position changes (duration in ms) */
  positionTransition?: number;
}

const EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Smoothly animates its size when children change dimensions.
 *
 * Inner div uses `width: fit-content` so it always sizes to its content.
 * Outer div clips via overflow-hidden and animates width/height.
 * All transitions managed via React state — no direct DOM writes.
 */
export function AnimatedResize({ children, className = '', style: externalStyle, duration = 200, positionTransition }: Readonly<Props>) {
  const innerRef = useRef<HTMLDivElement>(null);
  const lastSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const isFirst = useRef(true);
  const rafIds = useRef<number[]>([]);
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'lock' | 'animate'>('idle');
  const [lockSize, setLockSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Cleanup on unmount
  useLayoutEffect(() => {
    return () => {
      rafIds.current.forEach(id => cancelAnimationFrame(id));
      rafIds.current = [];
      if (timeoutId.current) clearTimeout(timeoutId.current);
    };
  }, []);

  // Measure and animate on children change
  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const newW = inner.offsetWidth;
    const newH = inner.offsetHeight;

    // Skip if no meaningful change
    if (Math.abs(lastSize.current.w - newW) < 2 && Math.abs(lastSize.current.h - newH) < 2) return;

    if (isFirst.current) {
      isFirst.current = false;
      lastSize.current = { w: newW, h: newH };
      setDisplaySize({ w: newW, h: newH });
      return;
    }

    // Cancel any in-flight animation
    rafIds.current.forEach(id => cancelAnimationFrame(id));
    rafIds.current = [];
    if (timeoutId.current) clearTimeout(timeoutId.current);

    const oldW = lastSize.current.w;
    const oldH = lastSize.current.h;
    lastSize.current = { w: newW, h: newH };

    // Phase 1: lock at old size (no size transition)
    setLockSize({ w: oldW, h: oldH });
    setPhase('lock');

    // Phase 2: after browser paints the lock, start the animation
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        setDisplaySize({ w: newW, h: newH });
        setPhase('animate');

        timeoutId.current = setTimeout(() => {
          timeoutId.current = null;
          setPhase('idle');
        }, duration + 20);
      });
      rafIds.current.push(raf2);
    });
    rafIds.current.push(raf1);
  }, [children, duration]);

  // Re-measure on window resize (snap, no animation)
  useEffect(() => {
    const handleResize = () => {
      const inner = innerRef.current;
      if (!inner) return;
      const newW = inner.offsetWidth;
      const newH = inner.offsetHeight;
      lastSize.current = { w: newW, h: newH };
      setDisplaySize({ w: newW, h: newH });
      setPhase('idle');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Build transition string
  const transitionParts: string[] = [];
  if (positionTransition) {
    transitionParts.push(`top ${positionTransition}ms ${EASING}`);
    transitionParts.push(`left ${positionTransition}ms ${EASING}`);
  }
  if (phase === 'animate') {
    transitionParts.push(`width ${duration}ms ${EASING}`);
    transitionParts.push(`height ${duration}ms ${EASING}`);
  }

  // Only constrain size during lock/animate phases.
  // In idle, let the outer size naturally so max-height/overflow-y-auto work on children.
  const constrainSize = phase !== 'idle';
  const w = phase === 'lock' ? lockSize.w : displaySize?.w;
  const h = phase === 'lock' ? lockSize.h : displaySize?.h;

  const outerStyle: CSSProperties = {
    ...externalStyle,
    ...(constrainSize && w != null && { width: w }),
    ...(constrainSize && h != null && { height: h }),
    ...(transitionParts.length > 0 && { transition: transitionParts.join(', ') }),
  };

  return (
    <div
      className={`${constrainSize ? 'overflow-hidden' : ''} ${className}`}
      style={outerStyle}
    >
      <div ref={innerRef} style={{ width: 'fit-content' }}>
        {children}
      </div>
    </div>
  );
}
