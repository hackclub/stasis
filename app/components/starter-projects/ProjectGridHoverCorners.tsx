'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface Props {
  gridEl: HTMLDivElement | null;
  selectedIndex: number | null;
}

const CORNER_SIZE = 20;
const BORDER_WIDTH = 3;
const INSET = 8;
const MAGNET_STRENGTH = 0.15;
const BREATHE_AMOUNT = 6;
const INITIAL_OFFSET = CORNER_SIZE + 5;

export function ProjectGridHoverCorners({ gridEl, selectedIndex }: Readonly<Props>) {
  const cornerTLRef = useRef<HTMLDivElement>(null);
  const cornerTRRef = useRef<HTMLDivElement>(null);
  const cornerBRRef = useRef<HTMLDivElement>(null);
  const cornerBLRef = useRef<HTMLDivElement>(null);
  
  const currentHoveredCardRef = useRef<HTMLElement | null>(null);
  const isFirstHoverRef = useRef(true);
  const basePositionsRef = useRef({ 
    tl: { x: -INITIAL_OFFSET, y: -INITIAL_OFFSET }, 
    tr: { x: -INITIAL_OFFSET, y: -INITIAL_OFFSET }, 
    br: { x: -INITIAL_OFFSET, y: -INITIAL_OFFSET }, 
    bl: { x: -INITIAL_OFFSET, y: -INITIAL_OFFSET } 
  });
  const breatheTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const isMouseDownRef = useRef(false);
  const previousSelectedIndexRef = useRef<number | null>(null);
  const lastMovementCardRef = useRef<HTMLElement | null>(null);
  const previousHoveredCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!gridEl) return;
    
    const cards = gridEl.querySelectorAll('[data-project-card]');
    
    if (previousSelectedIndexRef.current !== null && previousSelectedIndexRef.current < cards.length) {
      cards[previousSelectedIndexRef.current].classList.remove('selected-project');
    }
    
    if (selectedIndex !== null && selectedIndex < cards.length) {
      cards[selectedIndex].classList.add('selected-project');
    }
    
    previousSelectedIndexRef.current = selectedIndex;
  }, [gridEl, selectedIndex]);

  useEffect(() => {
    if (!gridEl || !cornerTLRef.current || !cornerTRRef.current || !cornerBRRef.current || !cornerBLRef.current) return;

    const cornerTL = cornerTLRef.current;
    const cornerTR = cornerTRRef.current;
    const cornerBR = cornerBRRef.current;
    const cornerBL = cornerBLRef.current;
    const basePositions = basePositionsRef.current;

    gsap.set([cornerTL, cornerTR, cornerBR, cornerBL], {
      opacity: 1,
      x: -INITIAL_OFFSET,
      y: -INITIAL_OFFSET,
    });

    basePositions.tl = { x: -INITIAL_OFFSET, y: -INITIAL_OFFSET };
    basePositions.tr = { x: -INITIAL_OFFSET, y: -INITIAL_OFFSET };
    basePositions.br = { x: -INITIAL_OFFSET, y: -INITIAL_OFFSET };
    basePositions.bl = { x: -INITIAL_OFFSET, y: -INITIAL_OFFSET };

    const breatheTimeline = gsap.timeline({ repeat: -1, yoyo: true });
    breatheTimelineRef.current = breatheTimeline;
    
    breatheTimeline.to(
      { value: 0 },
      {
        value: BREATHE_AMOUNT,
        duration: 1.0,
        ease: 'sine.inOut',
        onUpdate: function() {
          const breatheOffset = this.targets()[0].value;
          
          gsap.set(cornerTL, {
            x: basePositions.tl.x + breatheOffset,
            y: basePositions.tl.y + breatheOffset,
          });
          
          gsap.set(cornerTR, {
            x: basePositions.tr.x - breatheOffset,
            y: basePositions.tr.y + breatheOffset,
          });
          
          gsap.set(cornerBR, {
            x: basePositions.br.x - breatheOffset,
            y: basePositions.br.y - breatheOffset,
          });
          
          gsap.set(cornerBL, {
            x: basePositions.bl.x + breatheOffset,
            y: basePositions.bl.y - breatheOffset,
          });
        }
      }
    );

    const findNearestCard = (x: number, y: number): HTMLElement | null => {
      const cards = gridEl.querySelectorAll('[data-project-card]');
      let nearest: HTMLElement | null = null;
      let minDist = Infinity;

      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const cardCenterX = rect.left + rect.width / 2;
        const cardCenterY = rect.top + rect.height / 2;
        const dist = Math.hypot(x - cardCenterX, y - cardCenterY);
        
        if (dist < minDist) {
          minDist = dist;
          nearest = card as HTMLElement;
        }
      });

      return nearest;
    };

    const handleFirstHover = (card: HTMLElement) => {
      const rect = card.getBoundingClientRect();
      const gridRect = gridEl.getBoundingClientRect();

      const relativeTop = rect.top - gridRect.top + gridEl.scrollTop;
      const relativeLeft = rect.left - gridRect.left + gridEl.scrollLeft;
      const cardCenterX = relativeLeft + rect.width / 2;
      const cardCenterY = relativeTop + rect.height / 2;
      const gridCenterX = gridRect.width / 2;
      const gridCenterY = gridRect.height / 2;

      const fromTop = cardCenterY < gridCenterY;
      const fromLeft = cardCenterX < gridCenterX;

      const startX = fromLeft ? -INITIAL_OFFSET : gridRect.width + INITIAL_OFFSET;
      const startY = fromTop ? -INITIAL_OFFSET : gridRect.height + INITIAL_OFFSET;

      gsap.set(basePositions.tl, { x: startX, y: startY });
      gsap.set(basePositions.tr, { x: startX, y: startY });
      gsap.set(basePositions.br, { x: startX, y: startY });
      gsap.set(basePositions.bl, { x: startX, y: startY });

      gsap.to(basePositions.tl, {
        x: relativeLeft + INSET,
        y: relativeTop + INSET,
        duration: 0.6,
        ease: 'power2.out',
      });

      gsap.to(basePositions.tr, {
        x: relativeLeft + rect.width - INSET - CORNER_SIZE,
        y: relativeTop + INSET,
        duration: 0.6,
        ease: 'power2.out',
      });

      gsap.to(basePositions.br, {
        x: relativeLeft + rect.width - INSET - CORNER_SIZE,
        y: relativeTop + rect.height - INSET - CORNER_SIZE,
        duration: 0.6,
        ease: 'power2.out',
      });

      gsap.to(basePositions.bl, {
        x: relativeLeft + INSET,
        y: relativeTop + rect.height - INSET - CORNER_SIZE,
        duration: 0.6,
        ease: 'power2.out',
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const gridRect = gridEl.getBoundingClientRect();

      const isInGrid = e.clientX >= gridRect.left && e.clientX <= gridRect.right &&
                       e.clientY >= gridRect.top && e.clientY <= gridRect.bottom;

      if (isInGrid && !isMouseDownRef.current) {
        const nearestCard = findNearestCard(e.clientX, e.clientY);
        if (nearestCard && nearestCard !== currentHoveredCardRef.current) {
          if (previousHoveredCardRef.current) {
            previousHoveredCardRef.current.classList.remove('hovered-project');
            previousHoveredCardRef.current.classList.remove('active-project');
          }
          
          currentHoveredCardRef.current = nearestCard;
          nearestCard.classList.add('hovered-project');
          previousHoveredCardRef.current = nearestCard;

          if (isFirstHoverRef.current) {
            isFirstHoverRef.current = false;
            handleFirstHover(nearestCard);
          }
          
          if (breatheTimeline) {
            breatheTimeline.restart();
          }
        }
      } else if (!isInGrid) {
        if (currentHoveredCardRef.current) {
          currentHoveredCardRef.current.classList.remove('hovered-project');
          currentHoveredCardRef.current = null;
        }
        
        const padding = CORNER_SIZE + BREATHE_AMOUNT + 20;
        const mouseX = e.clientX - gridRect.left;
        const mouseY = e.clientY - gridRect.top;
        
        let targetX: number, targetY: number;

        if (mouseX < 0) {
          targetX = Math.min(mouseX, -padding);
        } else if (mouseX > gridRect.width) {
          targetX = Math.max(mouseX, gridRect.width + padding);
        } else {
          targetX = mouseX;
        }

        if (mouseY < 0) {
          targetY = Math.min(mouseY, -padding);
        } else if (mouseY > gridRect.height) {
          targetY = Math.max(mouseY, gridRect.height + padding);
        } else {
          targetY = mouseY;
        }

        gsap.to(basePositions.tl, { x: targetX, y: targetY, duration: 0.2, ease: 'power2.out', overwrite: true });
        gsap.to(basePositions.tr, { x: targetX, y: targetY, duration: 0.2, ease: 'power2.out', overwrite: true });
        gsap.to(basePositions.br, { x: targetX, y: targetY, duration: 0.2, ease: 'power2.out', overwrite: true });
        gsap.to(basePositions.bl, { x: targetX, y: targetY, duration: 0.2, ease: 'power2.out', overwrite: true });
      }

      if (currentHoveredCardRef.current) {
        if (currentHoveredCardRef.current !== lastMovementCardRef.current && !isMouseDownRef.current) {
          lastMovementCardRef.current = currentHoveredCardRef.current;
          const rect = currentHoveredCardRef.current.getBoundingClientRect();
          const relativeTop = rect.top - gridRect.top + gridEl.scrollTop;
          const relativeLeft = rect.left - gridRect.left + gridEl.scrollLeft;

          gsap.to(basePositions.tl, { x: relativeLeft + INSET, y: relativeTop + INSET, duration: 0.6, ease: 'power2.out' });
          gsap.to(basePositions.tr, { x: relativeLeft + rect.width - INSET - CORNER_SIZE, y: relativeTop + INSET, duration: 0.6, ease: 'power2.out' });
          gsap.to(basePositions.br, { x: relativeLeft + rect.width - INSET - CORNER_SIZE, y: relativeTop + rect.height - INSET - CORNER_SIZE, duration: 0.6, ease: 'power2.out' });
          gsap.to(basePositions.bl, { x: relativeLeft + INSET, y: relativeTop + rect.height - INSET - CORNER_SIZE, duration: 0.6, ease: 'power2.out' });
        } else {
          const rect = currentHoveredCardRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const offsetX = (e.clientX - centerX) * MAGNET_STRENGTH;
          const offsetY = (e.clientY - centerY) * MAGNET_STRENGTH;
          const relativeTop = rect.top - gridRect.top + gridEl.scrollTop;
          const relativeLeft = rect.left - gridRect.left + gridEl.scrollLeft;

          const tlTargetX = relativeLeft + INSET + offsetX;
          const tlTargetY = relativeTop + INSET + offsetY;
          const trTargetX = relativeLeft + rect.width - INSET - CORNER_SIZE + offsetX;
          const trTargetY = relativeTop + INSET + offsetY;
          const brTargetX = relativeLeft + rect.width - INSET - CORNER_SIZE + offsetX;
          const brTargetY = relativeTop + rect.height - INSET - CORNER_SIZE + offsetY;
          const blTargetX = relativeLeft + INSET + offsetX;
          const blTargetY = relativeTop + rect.height - INSET - CORNER_SIZE + offsetY;

          const distTL = Math.hypot(e.clientX - (rect.left + INSET), e.clientY - (rect.top + INSET));
          const distTR = Math.hypot(e.clientX - (rect.right - INSET), e.clientY - (rect.top + INSET));
          const distBR = Math.hypot(e.clientX - (rect.right - INSET), e.clientY - (rect.bottom - INSET));
          const distBL = Math.hypot(e.clientX - (rect.left + INSET), e.clientY - (rect.bottom - INSET));

          const baseDuration = 0.15;
          const dragFactor = 0.002;

          gsap.to(basePositions.tl, { x: tlTargetX, y: tlTargetY, duration: baseDuration + distTL * dragFactor, ease: 'power2.out' });
          gsap.to(basePositions.tr, { x: trTargetX, y: trTargetY, duration: baseDuration + distTR * dragFactor, ease: 'power2.out' });
          gsap.to(basePositions.br, { x: brTargetX, y: brTargetY, duration: baseDuration + distBR * dragFactor, ease: 'power2.out' });
          gsap.to(basePositions.bl, { x: blTargetX, y: blTargetY, duration: baseDuration + distBL * dragFactor, ease: 'power2.out' });
        }
      }
    };

    const handleMouseDown = () => {
      isMouseDownRef.current = true;
      lastMovementCardRef.current = null;
      
      if (currentHoveredCardRef.current) {
        currentHoveredCardRef.current.classList.add('active-project');

        const rect = currentHoveredCardRef.current.getBoundingClientRect();
        const gridRect = gridEl.getBoundingClientRect();

        const relativeTop = rect.top - gridRect.top + gridEl.scrollTop;
        const relativeLeft = rect.left - gridRect.left + gridEl.scrollLeft;
        const activeInset = INSET + 12;

        gsap.killTweensOf(basePositions.tl);
        gsap.killTweensOf(basePositions.tr);
        gsap.killTweensOf(basePositions.br);
        gsap.killTweensOf(basePositions.bl);

        gsap.to(basePositions.tl, {
          x: relativeLeft + activeInset,
          y: relativeTop + activeInset,
          duration: 0.15,
          ease: 'power2.out',
        });

        gsap.to(basePositions.tr, {
          x: relativeLeft + rect.width - activeInset - CORNER_SIZE,
          y: relativeTop + activeInset,
          duration: 0.15,
          ease: 'power2.out',
        });

        gsap.to(basePositions.br, {
          x: relativeLeft + rect.width - activeInset - CORNER_SIZE,
          y: relativeTop + rect.height - activeInset - CORNER_SIZE,
          duration: 0.15,
          ease: 'power2.out',
        });

        gsap.to(basePositions.bl, {
          x: relativeLeft + activeInset,
          y: relativeTop + rect.height - activeInset - CORNER_SIZE,
          duration: 0.15,
          ease: 'power2.out',
        });
      }
    };

    const handleMouseUp = () => {
      isMouseDownRef.current = false;
      lastMovementCardRef.current = null;
      
      if (currentHoveredCardRef.current) {
        currentHoveredCardRef.current.classList.remove('active-project');

        const rect = currentHoveredCardRef.current.getBoundingClientRect();
        const gridRect = gridEl.getBoundingClientRect();

        const relativeTop = rect.top - gridRect.top + gridEl.scrollTop;
        const relativeLeft = rect.left - gridRect.left + gridEl.scrollLeft;

        gsap.killTweensOf(basePositions.tl);
        gsap.killTweensOf(basePositions.tr);
        gsap.killTweensOf(basePositions.br);
        gsap.killTweensOf(basePositions.bl);

        gsap.to(basePositions.tl, {
          x: relativeLeft + INSET,
          y: relativeTop + INSET,
          duration: 0.15,
          ease: 'power2.out',
        });

        gsap.to(basePositions.tr, {
          x: relativeLeft + rect.width - INSET - CORNER_SIZE,
          y: relativeTop + INSET,
          duration: 0.15,
          ease: 'power2.out',
        });

        gsap.to(basePositions.br, {
          x: relativeLeft + rect.width - INSET - CORNER_SIZE,
          y: relativeTop + rect.height - INSET - CORNER_SIZE,
          duration: 0.15,
          ease: 'power2.out',
        });

        gsap.to(basePositions.bl, {
          x: relativeLeft + INSET,
          y: relativeTop + rect.height - INSET - CORNER_SIZE,
          duration: 0.15,
          ease: 'power2.out',
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      breatheTimeline.kill();
    };
  }, [gridEl]);

  return (
    <>
      <style jsx global>{`
        .hovered-project {
          filter: brightness(120%);
          outline: 3px solid var(--color-brand-500) !important;
          transition: outline 0.2s ease, filter 0.1s ease;
        }

        .active-project {
          filter: brightness(150%) !important;
          transition: outline 0.05s ease, filter 0.02s ease;
        }

        .selected-project {
          outline: 3px solid var(--color-brand-500) !important;
          filter: brightness(120%);
        }

        [data-project-card] {
          outline: 3px solid transparent;
          transition: outline 0.2s ease, filter 0.1s ease;
          z-index: 1;
        }
      `}</style>
      <div ref={cornerTLRef} className="absolute w-5 h-5 border-[3px] border-[#ea7452] border-r-0 border-b-0 pointer-events-none z-10 opacity-0" />
      <div ref={cornerTRRef} className="absolute w-5 h-5 border-[3px] border-[#ea7452] border-l-0 border-b-0 pointer-events-none z-10 opacity-0" />
      <div ref={cornerBRRef} className="absolute w-5 h-5 border-[3px] border-[#ea7452] border-l-0 border-t-0 pointer-events-none z-10 opacity-0" />
      <div ref={cornerBLRef} className="absolute w-5 h-5 border-[3px] border-[#ea7452] border-r-0 border-t-0 pointer-events-none z-10 opacity-0" />
    </>
  );
}
