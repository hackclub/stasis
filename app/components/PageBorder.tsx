'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Footer } from './Footer';

interface Props {
  inset?: string;
  mobileInset?: string;
  onFooterHeightChange?: (height: number) => void;
}

const KONAMI_SEQUENCE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];

const StarSVG = () => (
  <svg width="3rem" height="3rem" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M25.0361 0C25.1796 9.91826 25.9142 15.5411 29.6865 19.3135C33.5838 23.2108 39.4564 23.8641 50 23.9746V25.0244C39.4564 25.1349 33.5838 25.7892 29.6865 29.6865C25.7892 33.5838 25.1349 39.4564 25.0244 50H23.9756C23.8651 39.4564 23.2108 33.5838 19.3135 29.6865C15.5411 25.9142 9.91826 25.1796 0 25.0361V23.9629C9.91825 23.8194 15.5411 23.0858 19.3135 19.3135C23.0858 15.5411 23.8204 9.91826 23.9639 0H25.0361Z"
      fill="#9C8F88"
    />
  </svg>
);

export default function PageBorder({ inset = '3rem', mobileInset = '1rem', onFooterHeightChange }: Readonly<Props>) {
  const [containerHeight, setContainerHeight] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [bottomVisible, setBottomVisible] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const [konamiProgress, setKonamiProgress] = useState(0);
  const [activatedArrows, setActivatedArrows] = useState<Set<number>>(new Set());
  const [flashingArrows, setFlashingArrows] = useState<Set<number>>(new Set());
  const [konamiCompleted, setKonamiCompleted] = useState(false);
  const [footerLoaded, setFooterLoaded] = useState(false);
  
  const footerRef = useRef<HTMLDivElement>(null);
  const footerLoadedRef = useRef(false);

  const konamiProgressRef = useRef(0);
  const konamiCompletedRef = useRef(false);
  
  const [allContentLoaded, setAllContentLoaded] = useState(false);

  const triggerFlash = useCallback((arrowIndices: number[]) => {
    setFlashingArrows(new Set(arrowIndices));
    setTimeout(() => setFlashingArrows(new Set()), 300);
  }, []);

  const resetKonami = useCallback((keepArrows = false) => {
    konamiProgressRef.current = 0;
    setKonamiProgress(0);
    if (!keepArrows) {
      setActivatedArrows(new Set());
    }
  }, []);

  const handleKonamiInput = useCallback((direction: string) => {
    if (konamiCompletedRef.current) return;

    if (direction === KONAMI_SEQUENCE[konamiProgressRef.current]) {
      const currentIndex = konamiProgressRef.current;
      setActivatedArrows(prev => new Set([...prev, currentIndex]));
      triggerFlash([currentIndex]);
      konamiProgressRef.current++;
      setKonamiProgress(konamiProgressRef.current);

      if (konamiProgressRef.current === KONAMI_SEQUENCE.length) {
        konamiCompletedRef.current = true;
        setKonamiCompleted(true);
        resetKonami(true);
        const asteroidCat = (window as any).__stasisAsteroidCat;
        asteroidCat?.trigger();
      }
    } else {
      resetKonami();
      if (direction === 'up') {
        setActivatedArrows(new Set([0]));
        triggerFlash([0]);
        konamiProgressRef.current = 1;
        setKonamiProgress(1);
      }
    }
  }, [resetKonami, triggerFlash]);

  const handleKonamiInputRef = useRef(handleKonamiInput);
  const resetKonamiRef = useRef(resetKonami);
  handleKonamiInputRef.current = handleKonamiInput;
  resetKonamiRef.current = resetKonami;

  useEffect(() => {
    // const timer = setTimeout(() => {
    //   setMounted(true);
    //   setBottomVisible(true);
    // }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      const keyMap: Record<string, string> = {
        'ArrowUp': 'up', 'w': 'up', 'W': 'up',
        'ArrowDown': 'down', 's': 'down', 'S': 'down',
        'ArrowLeft': 'left', 'a': 'left', 'A': 'left',
        'ArrowRight': 'right', 'd': 'right', 'D': 'right'
      };
      const direction = keyMap[e.key];
      if (direction) handleKonamiInputRef.current(direction);
    };

    const handleClick = () => resetKonamiRef.current();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClick);

    const updateHeight = () => {
      if (footerRef.current) {
        const height = footerRef.current.offsetHeight;
        setFooterHeight(height);
        onFooterHeightChange?.(height);

        if (height > 0 && !footerLoadedRef.current) {
          footerLoadedRef.current = true;
          setFooterLoaded(true);
        }
      }

      setContainerHeight(document.body.scrollHeight);
    };

    setTimeout(updateHeight, 0);

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(document.body);
    if (footerRef.current) {
      resizeObserver.observe(footerRef.current);
    }
    window.addEventListener('resize', updateHeight);

    return () => {
      // clearTimeout(timer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
    };
  }, [onFooterHeightChange]);

  const arrowDirections: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];

  useEffect(() => {
    if (footerLoaded) {
      const timer = setTimeout(() => {
        setMounted(true);
        setBottomVisible(true);
      }, 100); 

      return () => clearTimeout(timer);
    }
  }, [footerLoaded]);

  useEffect(() => {
    const handleLoad = () => {
      setTimeout(() => {
        setAllContentLoaded(true);
      }, 1600);
    };
      if (document.readyState === 'complete') {
    handleLoad();
  } else {
    window.addEventListener('load', handleLoad);
    return () => window.removeEventListener('load', handleLoad);
  }
}, []);

useEffect(() => {
  if (allContentLoaded) {
    setMounted(true);
    setTimeout(() => {
      setFooterLoaded(true);
      if (footerRef.current) {
        footerRef.current.style.opacity = '1';
      }    
    }, 100);
  }
}, [allContentLoaded]);
  return (
    <>
      <style jsx global>{`
        @keyframes drawLineHorizontal {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes drawLineVertical {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes scaleInBounce {
          0% { transform: translate(calc(-50% + 1px), calc(-50% + 1px)) scale(0); }
          70% { transform: translate(calc(-50% + 1px), calc(-50% + 1px)) scale(1.1); }
          100% { transform: translate(calc(-50% + 1px), calc(-50% + 1px)) scale(1); }
        }
        @keyframes scaleInBounceTopRight {
          0% { transform: translate(50%, calc(-50% + 1px)) scale(0); }
          70% { transform: translate(50%, calc(-50% + 1px)) scale(1.1); }
          100% { transform: translate(50%, calc(-50% + 1px)) scale(1); }
        }
        @keyframes scaleInBounceBottomLeft {
          0% { transform: translate(calc(-50% + 1px), 50%) scale(0); }
          70% { transform: translate(calc(-50% + 1px), 50%) scale(1.1); }
          100% { transform: translate(calc(-50% + 1px), 50%) scale(1); }
        }
        @keyframes scaleInBounceBottomRight {
          0% { transform: translate(50%, 50%) scale(0); }
          70% { transform: translate(50%, 50%) scale(1.1); }
          100% { transform: translate(50%, 50%) scale(1); }
        }
        @keyframes scaleInBounceTopCenter {
          0% { transform: translate(-50%, -50%) scale(0); }
          70% { transform: translate(-50%, -50%) scale(1.1); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInReveal {
          from { opacity: 0; transform: translateX(-100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        @keyframes flashWhite {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }

        .line-top {
          transform-origin: left center;
          animation: drawLineHorizontal 400ms ease-out forwards;
          animation-delay: 0ms;
        }
        .line-right {
          transform-origin: center top;
          animation: drawLineVertical 400ms ease-out forwards;
          animation-delay: 200ms;
        }
        .line-bottom {
          transform-origin: right center;
          animation: drawLineHorizontal 400ms ease-out forwards;
          animation-delay: 400ms;
        }
        .line-left {
          transform-origin: center bottom;
          animation: drawLineVertical 400ms ease-out forwards;
          animation-delay: 600ms;
        }

        .star-tl {
          animation: scaleInBounce 200ms ease-out forwards;
          animation-delay: 1000ms;
          transform: translate(calc(-50% + 1px), calc(-50% + 1px)) scale(0);
        }
        .star-tr {
          animation: scaleInBounceTopRight 200ms ease-out forwards;
          animation-delay: 1000ms;
          transform: translate(50%, calc(-50% + 1px)) scale(0);
        }
        .star-bl {
          animation: scaleInBounceBottomLeft 200ms ease-out forwards;
          animation-delay: 1000ms;
          transform: translate(calc(-50% + 1px), 50%) scale(0);
        }
        .star-br {
          animation: scaleInBounceBottomRight 200ms ease-out forwards;
          animation-delay: 1000ms;
          transform: translate(50%, 50%) scale(0);
        }
        .star-tc {
          animation: scaleInBounceTopCenter 200ms ease-out forwards;
          animation-delay: 1000ms;
          transform: translate(-50%, -50%) scale(0);
          display: none;
        }

        .decoration-top {
          animation: fadeIn 400ms ease-out forwards;
          animation-delay: 1200ms;
          opacity: 0;
        }
        .decoration-bottom {
          animation: fadeIn 400ms ease-out forwards;
          animation-delay: 1300ms;
          opacity: 0;
        }
        .decoration-left {
          animation: fadeIn 400ms ease-out forwards;
          animation-delay: 1400ms;
          opacity: 0;
        }
        .decoration-right {
          animation: fadeIn 400ms ease-out forwards;
          animation-delay: 1500ms;
          opacity: 0;
        }

        .text-0 { overflow: hidden; visibility: hidden; }
        .text-0.mounted { visibility: visible; }
        .text-0 span { display: inline-block; transform: translateX(-100%); animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1200ms forwards; }

        .text-1 { overflow: hidden; visibility: hidden; }
        .text-1.mounted { visibility: visible; }
        .text-1 span { display: inline-block; transform: translateX(-100%); animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1240ms forwards; }

        .text-2 { overflow: hidden; visibility: hidden; }
        .text-2.mounted { visibility: visible; }
        .text-2 span { display: inline-block; transform: translateX(-100%); }
        .text-2.mounted span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1400ms forwards; }

        .text-3 { overflow: hidden; visibility: hidden; }
        .text-3.mounted { visibility: visible; }
        .text-3 span { display: inline-block; transform: translateX(-100%); }
        .text-3.mounted span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1440ms forwards; }

        .text-4 { overflow: hidden; visibility: hidden; }
        .text-4.mounted { visibility: visible; }
        .text-4 span { display: inline-block; transform: translateX(-100%); animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1360ms forwards; }

        .text-5 { overflow: hidden; visibility: hidden; }
        .text-5.mounted { visibility: visible; }
        .text-5 span { display: inline-block; transform: translateX(-100%); animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1400ms forwards; }

        .text-6 { overflow: hidden; visibility: hidden; }
        .text-6.mounted { visibility: visible; }
        .text-6 span { display: inline-block; transform: translateX(-100%); }
        .text-6.mounted span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1480ms forwards; }

        .text-7 { overflow: hidden; visibility: hidden; }
        .text-7.mounted { visibility: visible; }
        .text-7 span { display: inline-block; transform: translateX(-100%); }
        .text-7.mounted span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1520ms forwards; }

        .text-8 { overflow: hidden; visibility: hidden; }
        .text-8.mounted { visibility: visible; }
        .text-8 span { display: inline-block; transform: translateX(-100%); }
        .text-8.mounted span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1560ms forwards; }

        .text-9 { visibility: hidden; display: flex; align-items: center; gap: 0.25rem; opacity: 0.8; }
        .text-9.mounted { visibility: visible; }
        .text-9 .arrow-wrapper { overflow: hidden; }
        .text-9 .arrow-wrapper span { display: inline-block; transform: translateX(-100%); }
        .text-9 .arrow-wrapper:hover .arrow-dark { opacity: 0; }
        .text-9 .arrow-wrapper:hover .arrow-light { opacity: 1; }
        .text-9 .arrow-wrapper.activated:hover .arrow-dark { opacity: 1; }
        .text-9 .arrow-wrapper.activated:hover .arrow-light { opacity: 0; }
        .text-9 .arrow-wrapper.activated .arrow-dark { opacity: 0; }
        .text-9 .arrow-wrapper.activated .arrow-light { opacity: 1; }
        .text-9 .arrow-wrapper .arrow-white { opacity: 0 !important; position: absolute; top: 0; left: 0; pointer-events: none; }
        .text-9 .arrow-wrapper.flash .arrow-white { animation: flashWhite 300ms ease-out; }
        .text-9.mounted .arrow-wrapper:nth-child(1) span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1200ms forwards; }
        .text-9.mounted .arrow-wrapper:nth-child(2) span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1230ms forwards; }
        .text-9.mounted .arrow-wrapper:nth-child(3) span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1260ms forwards; }
        .text-9.mounted .arrow-wrapper:nth-child(4) span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1290ms forwards; }
        .text-9.mounted .arrow-wrapper:nth-child(5) span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1320ms forwards; }
        .text-9.mounted .arrow-wrapper:nth-child(6) span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1350ms forwards; }
        .text-9.mounted .arrow-wrapper:nth-child(7) span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1380ms forwards; }
        .text-9.mounted .arrow-wrapper:nth-child(8) span { animation: slideInReveal 320ms cubic-bezier(0.16, 1, 0.2, 1) 1410ms forwards; }

        @media (max-width: 768px) {
          .line-left, .line-right { display: none; }
          .star-tl, .star-tr, .star-bl, .star-br { display: none; }
          .star-tc { display: block; }
          .decoration-left, .decoration-right { display: none; }
          .text-0, .text-1, .text-3, .text-4, .text-5, .text-6, .text-7, .text-9 { display: none; }
          .line-bottom { animation-delay: 200ms !important; }
          .decoration-top { animation-delay: 400ms !important; }
          .decoration-bottom { animation-delay: 500ms !important; }
          .text-0 { left: 0.75rem !important; }
          .text-0 span { animation-delay: 600ms !important; }
          .text-2 { left: 0.75rem !important; }
          .text-2 span { animation-delay: 640ms !important; }
          .text-8 { left: 0.75rem !important; }
          .text-8 span { animation-delay: 680ms !important; }
          .decoration-top, .decoration-bottom { left: 0 !important; right: 0 !important; }
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-0 z-50 transition-all duration-300"
        style={{ height: containerHeight }}
        aria-hidden="true"
      >
        {/* Top line */}
        <div 
          className={`absolute left-0 right-0 h-px bg-cream-500 ${mounted ? 'line-top' : ''}`}
          style={{ top: inset, transform: 'scaleX(0)' }}
        />

        {/* Top center star (mobile) */}
        <div 
          className={`absolute md:hidden ${mounted ? 'star-tc' : ''}`}
          style={{ left: '50%', top: inset, transform: 'translate(-50%, -50%) scale(0)' }}
        >
          <StarSVG />
        </div>

        {/* Top decoration */}
        <img 
          src="/decorations-top.svg" 
          alt="" 
          className={`absolute md:object-contain object-none ${mounted ? 'decoration-top' : ''}`}
          style={{ left: inset, right: inset, top: inset, transform: 'translateY(-50%)', height: '9px', width: '100%', opacity: 0 }}
        />

        {/* Bottom line */}
        <div 
          className={`absolute left-0 right-0 h-px bg-cream-500 ${bottomVisible ? 'line-bottom' : ''}`}
          style={{ bottom: footerHeight, transform: 'scaleX(0)' }}
        />

        {/* Bottom decoration */}
        <img 
          src="/decorations-bottom.svg" 
          alt="" 
          className={`absolute md:object-contain object-none ${bottomVisible ? 'decoration-bottom' : ''}`}
          style={{ left: inset, right: inset, bottom: footerHeight, transform: 'translateY(50%)', height: '9px', width: '100%', opacity: 0 }}
        />

        {/* Left line (desktop) */}
        <div 
          className={`absolute bottom-0 top-0 w-px bg-cream-500 hidden md:block ${mounted ? 'line-left' : ''}`}
          style={{ left: inset, transform: 'scaleY(0)' }}
        />

        {/* Left decoration */}
        <div 
          className={`absolute hidden md:block ${mounted ? 'decoration-left' : ''}`}
          style={{ top: inset, bottom: inset, left: inset, transform: 'translateX(-50%)', width: '9px', opacity: 0 }}
        >
          <img src="/decorations-left.svg" alt="" className="h-full w-full" />
        </div>

        {/* Right line (desktop) */}
        <div 
          className={`absolute bottom-0 top-0 w-px bg-cream-500 hidden md:block ${mounted ? 'line-right' : ''}`}
          style={{ right: inset, transform: 'scaleY(0)' }}
        />

        {/* Right decoration */}
        <div 
          className={`absolute hidden md:block ${mounted ? 'decoration-right' : ''}`}
          style={{ top: inset, bottom: inset, right: inset, transform: 'translateX(50%)', width: '9px', opacity: 0 }}
        >
          <img src="/decorations-right.svg" alt="" className="h-full w-full" />
        </div>

        {/* Corner stars (desktop) */}
        <div className={`absolute hidden md:block ${mounted ? 'star-tl' : ''}`} style={{ left: inset, top: inset, transform: 'translate(calc(-50% + 1px), calc(-50% + 1px)) scale(0)' }}>
          <StarSVG />
        </div>
        <div className={`absolute hidden md:block ${mounted ? 'star-tr' : ''}`} style={{ right: inset, top: inset, transform: 'translate(50%, calc(-50% + 1px)) scale(0)' }}>
          <StarSVG />
        </div>
        <div className={`absolute hidden md:block ${bottomVisible ? 'star-bl' : ''}`} style={{ left: inset, bottom: footerHeight, transform: 'translate(calc(-50% + 1px), 50%) scale(0)' }}>
          <StarSVG />
        </div>
        <div className={`absolute hidden md:block ${bottomVisible ? 'star-br' : ''}`} style={{ right: inset, bottom: footerHeight, transform: 'translate(50%, 50%) scale(0)' }}>
          <StarSVG />
        </div>

        {/* Konami arrows (top) */}
        <div 
          className={`absolute font-mono text-xs text-cream-500 text-9 opacity-80 pointer-events-auto hidden md:flex ${mounted ? 'mounted' : ''}`}
          style={{ left: `calc(${inset} + 0.75rem)`, top: `calc(${inset} - 1.6rem)`, visibility: mounted ? 'visible' : 'hidden' }}
        >
          {arrowDirections.map((dir, i) => {
            const rotation = dir === 'up' ? 90 : dir === 'down' ? -90 : dir === 'right' ? 180 : 0;
            return (
              <div key={i} className={`arrow-wrapper inline-block overflow-hidden relative ${activatedArrows.has(i) ? 'activated' : ''} ${flashingArrows.has(i) ? 'flash' : ''}`}>
                <span>
                  <img className="arrow-dark transition-opacity duration-50" src="/pixel-arrow-dark.png" alt="" style={{ height: '0.8rem', imageRendering: 'pixelated', transform: `rotate(${rotation}deg)` }} />
                  <img className="arrow-light opacity-0 absolute top-0 left-0 transition-opacity duration-50" src="/pixel-arrow.png" alt="" style={{ height: '0.8rem', imageRendering: 'pixelated', transform: `rotate(${rotation}deg)` }} />
                  <img className="arrow-white" src="/pixel-arrow.png" alt="" style={{ height: '0.8rem', imageRendering: 'pixelated', transform: `rotate(${rotation}deg)`, filter: 'brightness(5)', opacity: 0 }} />
                </span>
              </div>
            );
          })}
        </div>

        {/* Text labels */}
        <div className={`absolute font-mono text-xs text-cream-500 text-0 pointer-events-auto ${mounted ? 'mounted' : ''}`} style={{ left: `calc(${inset} + 0.75rem)`, top: `calc(${inset} + 0.75rem)`, visibility: mounted ? 'visible' : 'hidden' }}>
          <span>38.61.172.4 | 26:75:19:66:b7:e1</span>
        </div>

        <div className={`absolute font-mono text-xs text-cream-500 text-1 pointer-events-auto ${mounted ? 'mounted' : ''}`} style={{ right: `calc(${inset} + 0.75rem)`, top: `calc(${inset} + 0.75rem)`, visibility: mounted ? 'visible' : 'hidden' }}>
          <span>COMMAND LINE: /USR/BIN/STASIS 2530676 - ROOT</span>
        </div>

        <div className={`absolute whitespace-pre-line font-mono text-xs leading-tight text-cream-500 text-2 pointer-events-auto ${bottomVisible ? 'mounted' : ''}`} style={{ left: `calc(${inset} + 0.75rem)`, bottom: `calc(${footerHeight}px + 0.75rem)`, visibility: bottomVisible ? 'visible' : 'hidden' }}>
          <span>IDENTIFICATION NUMBER REC2PMW0I1lA2GQ3X<br /><img src="/pixel-star.png" alt="" className="inline-block" style={{ height: '0.8rem', imageRendering: 'pixelated' }} /> STASIS V0.1 <span className="font-barcode">jksdfj</span> 2026-02 - HC 000000159</span>
        </div>

        <div className={`absolute font-mono text-xs text-cream-500 text-3 pointer-events-auto ${bottomVisible ? 'mounted' : ''}`} style={{ right: `calc(${inset} + 0.75rem)`, bottom: `calc(${footerHeight}px + 0.75rem)`, visibility: bottomVisible ? 'visible' : 'hidden' }}>
          <span>MODE //////// WEB</span>
        </div>

        {/* Vertical rotated text (left side) */}
        <div className={`absolute whitespace-nowrap text-xs text-cream-500 origin-bottom-right text-4 pointer-events-auto ${mounted ? 'mounted' : ''}`} style={{ left: `calc(${inset} + 0.75rem)`, top: `calc(${inset} + 0.75rem)`, transform: 'translateX(calc(-100% - 1.25rem)) translateY(-0.75rem) rotate(-90deg)', visibility: mounted ? 'visible' : 'hidden' }}>
          <span><span className="font-mono pointer-events-auto">0x003c0655f</span> <span className="font-barcode">iofrislubfkuhgsbiojdbfgozskjsdfhsbj</span></span>
        </div>

        {/* Vertical rotated text (right side) */}
        <div className={`absolute whitespace-nowrap font-mono text-xs text-cream-500 origin-bottom-left text-5 pointer-events-auto ${mounted ? 'mounted' : ''}`} style={{ right: `calc(${inset} + 0.75rem)`, top: `calc(${inset} + 0.75rem)`, transform: 'translateX(calc(100% + 1.25rem)) translateY(-0.75rem) rotate(90deg)', visibility: mounted ? 'visible' : 'hidden' }}>
          <span>STATUS: OPERATIONAL</span>
        </div>

        {/* Bottom left vertical text */}
        <div className={`absolute origin-top-left -rotate-90 whitespace-nowrap font-mono text-xs text-cream-500 text-6 pointer-events-auto ${bottomVisible ? 'mounted' : ''}`} style={{ left: `calc(${inset} - 1.5rem)`, bottom: `calc(${footerHeight}px + 0.1rem)`, visibility: bottomVisible ? 'visible' : 'hidden' }}>
          <span>HELLO WORLD</span>
        </div>

        {/* Bottom right vertical text */}
        <div className={`absolute origin-top-right rotate-90 whitespace-nowrap text-xs text-cream-500 text-7 ${bottomVisible ? 'mounted' : ''}`} style={{ right: `calc(${inset} - 1.5rem)`, bottom: `calc(${footerHeight}px + 0.1rem)`, visibility: bottomVisible ? 'visible' : 'hidden' }}>
          <span>75834920tge809hu43w89sherbgt839</span>
        </div>

        <div className={`absolute font-mono text-xs text-cream-500 text-8 pointer-events-auto z-10 ${bottomVisible ? 'mounted' : ''}`} style={{ left: `calc(${inset} + 0.75rem)`, bottom: `calc(${footerHeight}px - 1.6rem)`, visibility: bottomVisible ? 'visible' : 'hidden' }}>
          <span>BODY::FOOTER</span>
        </div>

        {/* Konami arrows (bottom) */}
        <div 
          className={`absolute font-mono text-xs text-cream-500 text-9 opacity-80 pointer-events-auto z-10 hidden md:flex ${bottomVisible ? 'mounted' : ''}`}
          style={{ right: `calc(${inset} + 0.75rem)`, bottom: `calc(${footerHeight}px - 1.6rem)`, visibility: bottomVisible ? 'visible' : 'hidden' }}
        >
          {arrowDirections.map((dir, i) => {
            const rotation = dir === 'up' ? 90 : dir === 'down' ? -90 : dir === 'right' ? 180 : 0;
            return (
              <div key={i} className={`arrow-wrapper inline-block overflow-hidden relative ${activatedArrows.has(i) ? 'activated' : ''} ${flashingArrows.has(i) ? 'flash' : ''}`}>
                <span>
                  <img className="arrow-dark transition-opacity duration-50" src="/pixel-arrow-dark.png" alt="" style={{ height: '0.8rem', imageRendering: 'pixelated', transform: `rotate(${rotation}deg)` }} />
                  <img className="arrow-light opacity-0 absolute top-0 left-0 transition-opacity duration-50" src="/pixel-arrow.png" alt="" style={{ height: '0.8rem', imageRendering: 'pixelated', transform: `rotate(${rotation}deg)` }} />
                  <img className="arrow-white" src="/pixel-arrow.png" alt="" style={{ height: '0.8rem', imageRendering: 'pixelated', transform: `rotate(${rotation}deg)`, filter: 'brightness(5)', opacity: 0 }} />
                </span>
              </div>
            );
          })}
        </div>

      </div>

      {/* Footer - outside aria-hidden so screen readers can access it */}
      <div className="pointer-events-none absolute inset-0 z-50" style={{ height: containerHeight }}>
        <div className="absolute left-0 right-0 bottom-0 opacity-0" ref={footerRef}>
          <Footer />
        </div>
      </div>
    </>
  );
}
