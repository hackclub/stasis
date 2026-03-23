'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const items = [
  {
    src: '/bambu-orange.png',
    name: 'Bambu Lab A1 Mini',
    description: 'Compact 3D printer with automatic calibration and high-speed printing capabilities.',
  },
  {
    src: '/bambu-p15-orange.png',
    name: 'Bambu Lab P1S',
    description: 'High-performance enclosed 3D printer designed for speed, reliability, and multi-material support.',
  },
  {
    src: '/bench-power-supply-orange.png',
    name: 'Bench Power Supply',
    description: 'Adjustable 30V 10A bench power supply for testing circuits with precise voltage control.',
  },
  {
    src: '/cnc-router-orange.png',
    name: 'CNC Router',
    description: 'Precision desktop CNC router for cutting, engraving, and milling wood, plastic, and aluminum.',
  },
  {
    src: '/oscilloscope-orange.png',
    name: 'Handheld Oscilloscope',
    description: '50MHz 2-channel handheld oscilloscope with built-in signal generator, perfect for field diagnostics and lab work.',
  },
  {
    src: '/ssd-orange.png',
    name: 'Samsung Portable SSD T7',
    description: '1TB SSD Type C!',
  },
];

const rotations = [-3, 2, -2, 3, -1, 2];

export function ImageCarousel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<number | null>(null);
  const [displayedItem, setDisplayedItem] = useState<typeof items[number] | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const currentSpeedRef = useRef<number>(20);
  const offsetRef = useRef<number>(0);
  const singleSetWidthRef = useRef<number>(0);

  // Tooltip position
  const tooltipTargetRef = useRef({ x: 0, y: 0 });
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipInitialized = useRef(false);

  // Keep displayedItem in sync, with debounced hide
  useEffect(() => {
    if (hoveredItem !== null) {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setDisplayedItem(items[hoveredItem % items.length]);
      setTooltipVisible(true);
    } else {
      hideTimeoutRef.current = setTimeout(() => {
        setTooltipVisible(false);
      }, 200);
    }
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [hoveredItem]);

  // Measure single set width
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    singleSetWidthRef.current = track.scrollWidth / 3;
  }, []);

  useEffect(() => {
    const normalSpeed = 20;
    const hoverSpeed = 3;
    const lerpRate = 3;
    const tooltipLerp = 0.12;

    const step = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;
      const dt = delta / 1000;

      // Scroll speed
      const targetSpeed = hovered ? hoverSpeed : normalSpeed;
      currentSpeedRef.current += (targetSpeed - currentSpeedRef.current) * Math.min(lerpRate * dt, 1);
      offsetRef.current += currentSpeedRef.current * dt;

      // Loop
      const setWidth = singleSetWidthRef.current;
      if (setWidth > 0 && offsetRef.current >= setWidth) {
        offsetRef.current -= setWidth;
      }

      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(${-offsetRef.current}px)`;
      }

      // Smooth tooltip position
      tooltipPosRef.current.x += (tooltipTargetRef.current.x - tooltipPosRef.current.x) * tooltipLerp;
      tooltipPosRef.current.y += (tooltipTargetRef.current.y - tooltipPosRef.current.y) * tooltipLerp;

      if (tooltipRef.current) {
        tooltipRef.current.style.left = `${tooltipPosRef.current.x}px`;
        tooltipRef.current.style.top = `${tooltipPosRef.current.y}px`;
      }

      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(animationRef.current);
  }, [hovered]);

  const updateTooltipTarget = useCallback((el: HTMLElement) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const itemRect = el.getBoundingClientRect();
    const x = itemRect.left + itemRect.width / 2 - containerRect.left;
    const y = itemRect.top - containerRect.top;

    tooltipTargetRef.current = { x, y };

    if (!tooltipInitialized.current) {
      tooltipPosRef.current = { x, y };
      tooltipInitialized.current = true;
    }
  }, []);

  // Continuously update tooltip target to track scrolling image
  useEffect(() => {
    if (hoveredItem === null) return;

    const interval = setInterval(() => {
      const els = containerRef.current?.querySelectorAll(`[data-carousel-idx="${hoveredItem}"]`);
      if (!els) return;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const centerX = containerRect.left + containerRect.width / 2;
      let closest: HTMLElement | null = null;
      let closestDist = Infinity;
      els.forEach((el) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.left + rect.width / 2 - centerX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = el as HTMLElement;
        }
      });
      if (closest) updateTooltipTarget(closest);
    }, 16);

    return () => clearInterval(interval);
  }, [hoveredItem, updateTooltipTarget]);

  const allItems = [...items, ...items, ...items];

  return (
    <div
      ref={containerRef}
      className="relative left-1/2 -translate-x-1/2 w-[calc(100%+120px)] md:w-[calc(100%+200px)]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setHoveredItem(null); }}
    >
      {/* Tooltip — outside overflow-hidden so it doesn't get clipped */}
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-20"
        style={{
          opacity: tooltipVisible ? 1 : 0,
          transition: 'opacity 150ms',
          transform: 'translate(-50%, calc(-100% - 8px))',
        }}
      >
        <div className="bg-brown-800 text-cream-100 border-2 border-cream-400 px-3 py-2 w-[220px]">
          <div className="text-xs font-bold leading-tight">{displayedItem?.name ?? '\u00A0'}</div>
          <div className="text-[10px] leading-snug mt-0.5 opacity-80">{displayedItem?.description ?? '\u00A0'}</div>
        </div>
      </div>

      {/* Scrolling area with overflow hidden */}
      <div className="relative overflow-hidden">
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 md:w-24 z-10 bg-gradient-to-r from-[#DAD2BF] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 md:w-24 z-10 bg-gradient-to-l from-[#DAD2BF] to-transparent" />

        <div
          ref={trackRef}
          className="flex items-center gap-8 py-4 will-change-transform"
          style={{ width: 'max-content' }}
        >
          {allItems.map((item, i) => {
            const idx = i % items.length;
            const rot = rotations[idx];
            const isHovered = hoveredItem === idx;
            return (
              <div
                key={`${item.src}-${i}`}
                data-carousel-idx={idx}
                className="flex-shrink-0 flex items-center justify-center w-16 h-16 md:w-20 md:h-20 cursor-pointer"
                style={{
                  transform: isHovered
                    ? `rotate(${rot + 4}deg) scale(1.2)`
                    : `rotate(${rot}deg) scale(1)`,
                  transition: 'transform 120ms cubic-bezier(0.2, 0, 0, 1)',
                }}
                onMouseEnter={(e) => {
                  setHoveredItem(idx);
                  updateTooltipTarget(e.currentTarget);
                }}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <img
                  src={item.src}
                  alt={item.name}
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
