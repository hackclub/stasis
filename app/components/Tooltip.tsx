'use client';

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 450;

/**
 * Hover tooltip with a small delay before appearing. Anchors to the cursor
 * position (captured on mouseenter), positioned above-right by default and
 * flipped if it would go off-screen.
 */
export function Tooltip({
  content, children,
}: Readonly<{
  content: ReactNode;
  children: ReactNode;
}>) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function show(e: React.MouseEvent | React.FocusEvent) {
    clearTimer();
    const x = 'clientX' in e ? e.clientX : 0;
    const y = 'clientY' in e ? e.clientY : 0;
    setAnchor({ x, y });
    timerRef.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
  }
  function hide() {
    clearTimer();
    setVisible(false);
    setAnchor(null);
    setPos(null);
  }

  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (!visible) return;
    function onScroll() { hide(); }
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible || !anchor) {
      setPos(null);
      return;
    }
    const tip = tooltipRef.current;
    if (!tip) return;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const padding = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Default: above the cursor
    let x = anchor.x - tw / 2;
    let y = anchor.y - th - padding;

    // Flip below if not enough room above
    if (y < 8) y = anchor.y + padding;

    // Clamp horizontally
    if (x < 8) x = 8;
    if (x + tw > vw - 8) x = vw - tw - 8;

    // If still overflows bottom, clamp upward
    if (y + th > vh - 8) y = vh - th - 8;

    setPos({ x, y });
  }, [visible, anchor, content]);

  return (
    <span
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseMove={(e) => {
        // If timer is still pending (haven't shown yet), update anchor to follow
        if (!visible && timerRef.current) {
          setAnchor({ x: e.clientX, y: e.clientY });
        }
      }}
      onFocus={show}
      onBlur={hide}
      style={{ display: 'inline' }}
    >
      {children}
      {visible
        ? createPortal(
            <div
              ref={tooltipRef}
              style={pos ? { left: pos.x, top: pos.y, opacity: 1 } : { left: -9999, top: -9999, opacity: 0 }}
              className="console-tooltip fixed z-[10000] max-w-xs bg-brown-950 text-cream-100 text-xs px-2.5 py-1.5 leading-snug shadow-[0_4px_16px_rgba(0,0,0,0.5)] outline outline-1 -outline-offset-1 outline-cream-200/15 font-sans pointer-events-none"
              role="tooltip"
            >
              {content}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}
