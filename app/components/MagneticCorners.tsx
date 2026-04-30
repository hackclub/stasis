'use client';

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';

interface MagneticCornersProps {
  mode?: 'corners' | 'border';
  cornerSize?: number;
  borderWidth?: number;
  offset?: number;
  color?: string;
  hoverColor?: string;
  magnetStrength?: number;
  activationDistance?: number;
  deactivationDistance?: number;
  hoverOffsetIncrease?: number;
  children?: ReactNode;
  className?: string;
}

export function MagneticCorners({
  mode = 'corners',
  cornerSize = 20,
  borderWidth = 3,
  offset = 6,
  color = 'color-mix(in srgb, var(--color-orange-500) 56%, transparent)',
  hoverColor,
  magnetStrength = 0.1,
  activationDistance = 50,
  deactivationDistance = 60,
  hoverOffsetIncrease = 4,
  children,
  className
}: Readonly<MagneticCornersProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const currentOffset = isActive ? offset + hoverOffsetIncrease : offset;
  const currentColor = isActive && hoverColor ? hoverColor : color;

  const getDistanceToElement = useCallback((mouseX: number, mouseY: number, rect: DOMRect): number => {
    const closestX = Math.max(rect.left, Math.min(mouseX, rect.right));
    const closestY = Math.max(rect.top, Math.min(mouseY, rect.bottom));
    const deltaX = mouseX - closestX;
    const deltaY = mouseY - closestY;
    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const distance = getDistanceToElement(e.clientX, e.clientY, rect);

      if (!isActive && distance <= activationDistance) {
        setIsActive(true);
      } else if (isActive && distance > deactivationDistance) {
        setIsActive(false);
        setTranslateX(0);
        setTranslateY(0);
        return;
      }

      if (isActive || distance <= activationDistance) {
        const offsetX = e.clientX - centerX;
        const offsetY = e.clientY - centerY;
        setTranslateX(offsetX * magnetStrength);
        setTranslateY(offsetY * magnetStrength);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isActive, activationDistance, deactivationDistance, magnetStrength, getDistanceToElement]);

  const handleHitboxClick = useCallback(() => {
    const target = containerRef.current?.querySelector<HTMLElement>('button, a');
    if (target) {
      target.click();
    }
  }, []);

  const cornerStyle = {
    transform: `translate(${translateX}px, ${translateY}px)`,
    transition: 'all 0.2s ease-out'
  };

  return (
    <>
      <style jsx global>{`
        .magnetic-corners-wrapper.active button {
          background-color: var(--color-orange-500) !important;
        }
        .magnetic-corners-wrapper.active button::before {
          border-color: var(--color-orange-400) !important;
          inset: -0.5rem !important;
        }
      `}</style>
      <div
        ref={containerRef}
        className={`magnetic-corners-wrapper relative inline-block ${isActive ? 'active' : ''} ${className || ''}`}
        onClick={isActive ? handleHitboxClick : undefined}
      >
        {/* Invisible hitbox that extends to activation distance for cursor: pointer */}
        <div
          className="absolute z-[1] cursor-pointer"
          style={{
            top: `-${activationDistance}px`,
            left: `-${activationDistance}px`,
            right: `-${activationDistance}px`,
            bottom: `-${activationDistance}px`,
          }}
          onClick={handleHitboxClick}
        />
        {children}
        
        {mode === 'border' ? (
          <div
            className="absolute pointer-events-none z-[2] transition-all duration-150 ease-out"
            style={{
              top: `calc(-1 * ${currentOffset}px)`,
              left: `calc(-1 * ${currentOffset}px)`,
              right: `calc(-1 * ${currentOffset}px)`,
              bottom: `calc(-1 * ${currentOffset}px)`,
              border: `${borderWidth}px solid ${currentColor}`,
              transform: `translate(${translateX}px, ${translateY}px)`
            }}
          />
        ) : (
          <>
            <div
              className="absolute pointer-events-none z-[2]"
              style={{
                top: `calc(-1 * ${currentOffset}px)`,
                left: `calc(-1 * ${currentOffset}px)`,
                width: `${cornerSize}px`,
                height: `${cornerSize}px`,
                borderLeft: `${borderWidth}px solid ${currentColor}`,
                borderTop: `${borderWidth}px solid ${currentColor}`,
                ...cornerStyle
              }}
            />
            <div
              className="absolute pointer-events-none z-[2]"
              style={{
                top: `calc(-1 * ${currentOffset}px)`,
                right: `calc(-1 * ${currentOffset}px)`,
                width: `${cornerSize}px`,
                height: `${cornerSize}px`,
                borderRight: `${borderWidth}px solid ${currentColor}`,
                borderTop: `${borderWidth}px solid ${currentColor}`,
                ...cornerStyle
              }}
            />
            <div
              className="absolute pointer-events-none z-[2]"
              style={{
                bottom: `calc(-1 * ${currentOffset}px)`,
                right: `calc(-1 * ${currentOffset}px)`,
                width: `${cornerSize}px`,
                height: `${cornerSize}px`,
                borderRight: `${borderWidth}px solid ${currentColor}`,
                borderBottom: `${borderWidth}px solid ${currentColor}`,
                ...cornerStyle
              }}
            />
            <div
              className="absolute pointer-events-none z-[2]"
              style={{
                bottom: `calc(-1 * ${currentOffset}px)`,
                left: `calc(-1 * ${currentOffset}px)`,
                width: `${cornerSize}px`,
                height: `${cornerSize}px`,
                borderLeft: `${borderWidth}px solid ${currentColor}`,
                borderBottom: `${borderWidth}px solid ${currentColor}`,
                ...cornerStyle
              }}
            />
          </>
        )}
      </div>
    </>
  );
}
