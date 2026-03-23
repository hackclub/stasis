'use client';

import { useRef, useEffect, useCallback, useState, type ReactNode, type CSSProperties } from 'react';

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
 * Inner div uses `width: fit-content` so it always sizes to its content
 * regardless of the outer div's constraints. The outer div clips via
 * overflow-hidden and animates width/height.
 *
 * Transitions are managed entirely via React state — no direct DOM style
 * writes — so they never conflict with React-managed style props.
 */
export function AnimatedResize({ children, className = '', style: externalStyle, duration = 200, positionTransition }: Readonly<Props>) {
  const innerRef = useRef<HTMLDivElement>(null);
  const lastSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const animating = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirst = useRef(true);
  const [phase, setPhase] = useState<'idle' | 'lock' | 'animate'>('idle');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const lockSize = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const animate = useCallback(() => {
    const inner = innerRef.current;
    if (!inner || animating.current) return;

    const newW = inner.offsetWidth;
    const newH = inner.offsetHeight;

    if (Math.abs(lastSize.current.w - newW) < 2 && Math.abs(lastSize.current.h - newH) < 2) return;

    if (isFirst.current) {
      isFirst.current = false;
      lastSize.current = { w: newW, h: newH };
      setSize({ w: newW, h: newH });
      return;
    }

    animating.current = true;
    lockSize.current = { ...lastSize.current };
    lastSize.current = { w: newW, h: newH };

    // Phase 1: lock at old size
    setPhase('lock');

    // Phase 2: after browser paints the lock, start animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSize({ w: newW, h: newH });
        setPhase('animate');

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          animating.current = false;
          setPhase('idle');
          // Check if content changed during animation
          animate();
        }, duration + 20);
      });
    });
  }, [duration]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => animate());
    return () => cancelAnimationFrame(raf);
  }, [children, animate]);

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

  const displayW = phase === 'lock' ? lockSize.current.w : size?.w;
  const displayH = phase === 'lock' ? lockSize.current.h : size?.h;

  const outerStyle: CSSProperties = {
    ...externalStyle,
    ...(displayW != null && { width: displayW }),
    ...(displayH != null && { height: displayH }),
    ...(transitionParts.length > 0 && { transition: transitionParts.join(', ') }),
  };

  return (
    <div
      className={`overflow-hidden ${className}`}
      style={outerStyle}
    >
      <div ref={innerRef} style={{ width: 'fit-content' }}>
        {children}
      </div>
    </div>
  );
}
