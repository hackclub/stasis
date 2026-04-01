'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MagneticCorners } from '@/app/components/MagneticCorners';
import type { TamagotchiStatus } from '@/lib/tamagotchi';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*';
const FACES = [':)', ':D', ':(', '>:)', ':P', ':O', ';)', 'xD', ':3', 'c:', ':/', 'B)', '>:(', ':B', 'o:', ':J'];
const GRID_ANGLE = 30 * Math.PI / 180;

const TITLE_TEXT = 'The Tamagotchi Streak Challenge';
const SUBTITLE_TEXT = 'Work on a project every day for seven days, get a Tamagotchi pet. You have two weeks.';
const HIGHLIGHT_START = 50;
const HIGHLIGHT_END = 64;

function easeOutTime(t: number): number {
  return Math.pow(t, 3);
}

function buildTimings(text: string, totalDuration: number, scrambleDuration: number) {
  const len = text.length;
  return text.split('').map((ch, i) => {
    const normalizedPos = len > 1 ? i / (len - 1) : 0;
    const revealTime = easeOutTime(normalizedPos) * totalDuration;
    const isStatic = ch === ' ' || /[^\w]/.test(ch);
    const lockTime = isStatic ? revealTime : revealTime + scrambleDuration + Math.random() * 100;
    return { revealTime, lockTime };
  });
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------- ScrambleText ----------

function ScrambleText({
  text, active, totalDuration = 1200, scrambleDuration = 250, className, renderChar,
}: {
  text: string; active: boolean; totalDuration?: number; scrambleDuration?: number;
  className?: string;
  renderChar?: (char: string, index: number, visible: boolean, onHover?: () => void) => React.ReactNode;
}) {
  const timings = useMemo(() => buildTimings(text, totalDuration, scrambleDuration), [text, totalDuration, scrambleDuration]);
  const [chars, setChars] = useState<string[]>(() => text.split(''));
  const [visibleArr, setVisibleArr] = useState<boolean[]>(() => text.split('').map(() => false));
  const [typingDone, setTypingDone] = useState(false);
  const hoverAnimatingRef = useRef<Set<number>>(new Set());
  const hoverTimeoutsRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!active) return;
    const startTime = Date.now();
    let frameId: number;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const nc: string[] = []; const nv: boolean[] = []; let allDone = true;
      for (let i = 0; i < text.length; i++) {
        const { revealTime, lockTime } = timings[i]; const ch = text[i];
        if (elapsed < revealTime) { nc.push(ch); nv.push(false); allDone = false; }
        else if (ch === ' ' || /[^\w]/.test(ch)) { nc.push(ch); nv.push(true); }
        else if (elapsed >= lockTime) { nc.push(ch); nv.push(true); }
        else { nc.push(CHARSET[Math.floor(Math.random() * CHARSET.length)]); nv.push(true); allDone = false; }
      }
      setChars(nc); setVisibleArr(nv);
      if (allDone) setTypingDone(true); else frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [text, active, timings]);

  const scrambleChar = useCallback((index: number) => {
    const ch = text[index];
    if (ch === ' ' || /[^\w]/.test(ch) || hoverAnimatingRef.current.has(index)) return;
    hoverAnimatingRef.current.add(index);
    const run = (iter: number) => {
      if (iter < 7) {
        setChars(p => { const n = [...p]; n[index] = CHARSET[Math.floor(Math.random() * CHARSET.length)]; return n; });
        const id = window.setTimeout(() => run(iter + 1), 10 * Math.pow(1.2, iter + 1));
        hoverTimeoutsRef.current.set(index, id);
      } else {
        setChars(p => { const n = [...p]; n[index] = text[index]; return n; });
        hoverAnimatingRef.current.delete(index); hoverTimeoutsRef.current.delete(index);
      }
    };
    run(0);
  }, [text]);

  const handleHover = useCallback((index: number) => {
    if (!typingDone) return;
    scrambleChar(index);
    for (let i = Math.max(0, index - 1); i <= Math.min(text.length - 1, index + 1); i++) {
      if (i !== index) { const c = i; setTimeout(() => scrambleChar(c), Math.abs(i - index) * 15); }
    }
  }, [typingDone, scrambleChar, text.length]);

  useEffect(() => { return () => { hoverTimeoutsRef.current.forEach(id => clearTimeout(id)); }; }, []);

  return (
    <span className={className}>
      {text.split('').map((orig, i) => {
        const displayed = active ? chars[i] ?? orig : orig;
        const isVisible = active ? (visibleArr[i] ?? false) : false;
        const onHover = typingDone ? () => handleHover(i) : undefined;
        if (renderChar) return renderChar(displayed, i, isVisible, onHover);
        return (
          <span key={i} className="cursor-default" style={{ visibility: isVisible ? 'visible' : 'hidden' }} onMouseEnter={onHover}>
            {displayed}
          </span>
        );
      })}
    </span>
  );
}

// ---------- Draggable tamagotchi ----------

function useDraggableSpring() {
  const elRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const velRef = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const springFrame = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  const applyTransform = useCallback(() => {
    if (elRef.current) elRef.current.style.transform = `translate(${posRef.current.x}px, ${posRef.current.y}px)`;
  }, []);

  const startSpring = useCallback(() => {
    cancelAnimationFrame(springFrame.current);
    const vel = velRef.current;
    const tick = () => {
      vel.x = (vel.x + (-posRef.current.x * 0.08)) * 0.82;
      vel.y = (vel.y + (-posRef.current.y * 0.08)) * 0.82;
      posRef.current.x += vel.x; posRef.current.y += vel.y;
      if (Math.abs(posRef.current.x) < 0.3 && Math.abs(posRef.current.y) < 0.3 && Math.abs(vel.x) < 0.1 && Math.abs(vel.y) < 0.1) {
        posRef.current = { x: 0, y: 0 }; applyTransform(); return;
      }
      applyTransform(); springFrame.current = requestAnimationFrame(tick);
    };
    springFrame.current = requestAnimationFrame(tick);
  }, [applyTransform]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true; setIsDragging(true);
    cancelAnimationFrame(springFrame.current);
    startRef.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };
    velRef.current = { x: 0, y: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [springFrame]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    posRef.current = { x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y };
    applyTransform();
  }, [applyTransform]);

  const onPointerUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false; setIsDragging(false); startSpring();
  }, [startSpring]);

  useEffect(() => { return () => cancelAnimationFrame(springFrame.current); }, []);
  return { elRef, isDragging, onPointerDown, onPointerMove, onPointerUp };
}

// ---------- Main overlay ----------

interface Props { onClose: () => void; status: TamagotchiStatus; }

export function TamagotchiOverlay({ onClose, status }: Props) {
  const skipIntro = typeof window !== 'undefined' && !!localStorage.getItem('tamagotchi_started');
  const windowLen = status.windowDays.length;
  const lastWindowIdx = windowLen - 1;
  const todayIdx = status.windowDays.findIndex(d => d.isToday);

  const gridSpeedRef = useRef(skipIntro ? 0.2 : 3);
  const gridOffsetRef = useRef(0);
  const [gridPos, setGridPos] = useState({ x: 0, y: 0 });

  // Intro states (use windowLen for square count)
  const [visibleSquares, setVisibleSquares] = useState(skipIntro ? windowLen : 0);
  const [showTamagotchi, setShowTamagotchi] = useState(false);
  const [showTitle, setShowTitle] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const [showBackButton, setShowBackButton] = useState(skipIntro);
  const [hopKeys, setHopKeys] = useState<number[]>(() => Array(windowLen).fill(0));
  const [squareColors, setSquareColors] = useState<boolean[]>(() => Array(windowLen).fill(skipIntro ? false : true));
  const [squareFaces, setSquareFaces] = useState<(string | null)[]>(() => Array(windowLen).fill(null));
  const tama = useDraggableSpring();

  // Detail mode states
  const [detailMode, setDetailMode] = useState(skipIntro);
  const [lastSquareHighlight, setLastSquareHighlight] = useState(skipIntro);
  const [showDetailText, setShowDetailText] = useState(skipIntro);
  const [tamaHidePhase, setTamaHidePhase] = useState(skipIntro ? 2 : 0);
  const [innerTamaVisible, setInnerTamaVisible] = useState(skipIntro);
  const [innerTamaSettled, setInnerTamaSettled] = useState(skipIntro);
  const [visibleNumbers, setVisibleNumbers] = useState(skipIntro ? windowLen - 1 : 0);
  const [showFirstLabel, setShowFirstLabel] = useState(skipIntro);
  const [showLastLabel, setShowLastLabel] = useState(skipIntro);
  const [hoveredSquare, setHoveredSquare] = useState<string | null>(null);
  const squaresRef = useRef<HTMLDivElement>(null);
  const [squaresFlip, setSquaresFlip] = useState<number | null>(null);
  const [linePulseKey, setLinePulseKey] = useState(0);
  const [linePulsing, setLinePulsing] = useState(false);

  // How many extra squares to show on each side (max 3 visible)
  const MAX_EXTRA_VISIBLE = 3;
  const pastVisible = Math.min(status.pastDays.length, MAX_EXTRA_VISIBLE);
  const futureVisible = Math.min(status.futureDays.length, MAX_EXTRA_VISIBLE);
  const pastOverflow = status.pastDays.length - pastVisible;
  const futureOverflow = status.futureDays.length - futureVisible;
  // Show the most recent past days (closest to today)
  const pastToShow = status.pastDays.slice(-pastVisible);
  const futureToShow = status.futureDays.slice(0, futureVisible);

  // Grid animation
  useEffect(() => {
    let frameId: number;
    const animate = () => {
      gridOffsetRef.current += gridSpeedRef.current;
      setGridPos({ x: gridOffsetRef.current * Math.cos(GRID_ANGLE), y: gridOffsetRef.current * Math.sin(GRID_ANGLE) });
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Intro timing chain (skipped if user has seen it before)
  useEffect(() => {
    if (skipIntro) return;
    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(setTimeout(() => {
      const dec = () => { gridSpeedRef.current *= 0.96; if (gridSpeedRef.current > 0.25) requestAnimationFrame(dec); else gridSpeedRef.current = 0.2; };
      dec();
    }, 800));
    for (let i = 0; i < windowLen; i++) t.push(setTimeout(() => setVisibleSquares(i + 1), 1500 + i * 280));
    const tamaTime = 1500 + (windowLen - 1) * 280 + 500;
    t.push(setTimeout(() => setShowTamagotchi(true), tamaTime));
    const titleTime = tamaTime + 1200;
    t.push(setTimeout(() => setShowTitle(true), titleTime));
    const subTime = titleTime + 900;
    t.push(setTimeout(() => setShowSubtitle(true), subTime));
    const btnTime = subTime + 1800;
    t.push(setTimeout(() => setShowButton(true), btnTime));
    t.push(setTimeout(() => setShowBackButton(true), btnTime + 800));
    return () => t.forEach(clearTimeout);
  }, [skipIntro, windowLen]);

  // Periodic hop — stops when detail mode activates
  const lastFaceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!showBackButton || detailMode) return;
    let wave = -1;
    let intervalId: ReturnType<typeof setInterval>;
    const pickFace = (forSquare: number) => {
      if (forSquare === lastWindowIdx) { lastFaceRef.current = ':D'; return ':D'; }
      const prev = lastFaceRef.current;
      const pool = FACES.filter(f => f !== prev);
      const face = pool[Math.floor(Math.random() * pool.length)];
      lastFaceRef.current = face;
      return face;
    };
    const fireWave = () => {
      wave++;
      const target = wave % (windowLen + 1);
      const leadingEdge = target - 1;
      for (let i = 0; i < windowLen; i++) {
        setTimeout(() => {
          setSquareColors(p => { const n = [...p]; n[i] = i < target; return n; });
          setHopKeys(p => { const n = [...p]; n[i] = p[i] + 1; return n; });
          if (i === leadingEdge) {
            setSquareFaces(() => {
              const n: (string | null)[] = Array(windowLen).fill(null);
              n[i] = pickFace(i);
              return n;
            });
          }
        }, i * 60);
      }
      if (target === 0) setSquareFaces(Array(windowLen).fill(null));
    };
    const delay = setTimeout(() => { fireWave(); intervalId = setInterval(fireWave, 2500); }, 300);
    return () => { clearTimeout(delay); clearInterval(intervalId); };
  }, [showBackButton, detailMode, windowLen, lastWindowIdx]);

  // Periodic orange line pulse in detail mode
  useEffect(() => {
    if (!detailMode || !showDetailText) return;
    const interval = setInterval(() => {
      setLinePulsing(true);
      setLinePulseKey(k => k + 1);
      setTimeout(() => setLinePulsing(false), windowLen * 80 + 500);
    }, 5000);
    return () => clearInterval(interval);
  }, [detailMode, showDetailText, windowLen]);

  // Close with exit animation
  const [closing, setClosing] = useState(false);
  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose(), 800);
  }, [closing, onClose]);

  // Block body scroll while overlay is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [handleClose]);

  // ---------- Detail mode handler ----------
  const handleTellMeMore = useCallback(() => {
    localStorage.setItem('tamagotchi_started', '1');

    const beforeY = squaresRef.current?.getBoundingClientRect().top ?? 0;
    setDetailMode(true);
    setSquareColors(Array(windowLen).fill(false));
    setLastSquareHighlight(true);
    setHopKeys(prev => prev.map(k => k + 1));

    requestAnimationFrame(() => {
      const afterY = squaresRef.current?.getBoundingClientRect().top ?? 0;
      const delta = beforeY - afterY;
      setSquaresFlip(delta);
      requestAnimationFrame(() => setSquaresFlip(0));
    });

    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(setTimeout(() => setShowDetailText(true), 700));
    t.push(setTimeout(() => setTamaHidePhase(1), 1000));
    t.push(setTimeout(() => setTamaHidePhase(2), 1350));
    t.push(setTimeout(() => setInnerTamaVisible(true), 1650));
    t.push(setTimeout(() => setInnerTamaSettled(true), 1700));
    t.push(setTimeout(() => {
      for (let i = 0; i < windowLen - 1; i++) {
        setTimeout(() => setVisibleNumbers(i + 1), i * 80);
      }
    }, 1500));
    t.push(setTimeout(() => setShowFirstLabel(true), 2000));
    t.push(setTimeout(() => setShowLastLabel(true), 2150));
    return () => t.forEach(clearTimeout);
  }, [windowLen]);

  // ---------- Square style helpers ----------
  const getWindowSquareClass = (i: number) => {
    const day = status.windowDays[i];
    if (!day) return 'bg-brown-900 border-3 border-[#4D4238]';

    if (detailMode) {
      // Completed day (orange bg)
      if (day.completed) return 'bg-orange-500';
      // Last square (tamagotchi goal, not yet completed)
      if (i === lastWindowIdx) return 'bg-brown-900 border-3 border-orange-500';
      // Today — bright glow border
      if (day.isToday) return 'bg-brown-900 border-3 border-orange-500 border-glow';
      // Future unfinished
      return 'bg-brown-900 border-3 border-[#4D4238]';
    }

    // Intro mode
    if (squareColors[i]) return 'bg-orange-500';
    return 'bg-brown-900 border-3 border-[#4D4238]';
  };

  const getLineClass = (i: number) => {
    if (visibleSquares <= i) return '';
    if (detailMode) {
      const prev = status.windowDays[i - 1];
      const curr = status.windowDays[i];
      if (prev?.completed && curr?.completed) return 'bg-orange-500/30';
      return 'bg-[#4D4238]';
    }
    if (squareColors[i - 1] && squareColors[i]) return 'bg-orange-500/20 led-flicker-slow';
    return 'bg-[#4D4238] led-flicker-slow';
  };

  // ---------- "You Won" state ----------
  if (status.challengeComplete && detailMode) {
    return (
      <div className={`fixed inset-0 z-50 overflow-hidden font-mono ${closing ? 'animate-[tamagotchi-fly-down_0.8s_cubic-bezier(0.16,1,0.2,1)_both]' : 'animate-[tamagotchi-fly-up_0.8s_cubic-bezier(0.16,1,0.2,1)_both]'}`}
        style={{ background: 'var(--color-orange-500)' }}
      >
        {/* Grid texture */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url(/grid-texture.png)', backgroundSize: '4rem 4rem', imageRendering: 'pixelated' }} />

        {/* Back button */}
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 2xl:top-8 2xl:left-8 z-30">
          <MagneticCorners activationDistance={35} deactivationDistance={45}>
            <button onClick={handleClose} className="block bg-white/20 p-2 md:p-4 2xl:p-6 relative cursor-pointer hover:bg-white/30 transition-colors">
              <img src="/home-light.svg" alt="Back" className="w-8 h-8" />
            </button>
          </MagneticCorners>
        </div>

        {/* Centered win content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
          <img src="/tamagotchi.png" alt="Tamagotchi" className="mb-8 object-contain" style={{ width: 120, height: 120, maxWidth: 'none' }} />
          <h1 className="text-white text-3xl sm:text-5xl md:text-6xl font-bold uppercase tracking-wider text-center">
            You did it!
          </h1>
          <p className="mt-6 text-white/90 text-sm sm:text-lg md:text-xl uppercase tracking-wide text-center max-w-xl">
            Seven days in a row. Your Tamagotchi is on its way.
          </p>
          <p className="mt-4 text-white/70 text-xs sm:text-sm uppercase tracking-wide text-center max-w-lg">
            Share your achievement in{' '}
            <a href="https://hackclub.enterprise.slack.com/archives/C09HSQM550A" target="_blank" rel="noopener noreferrer" className="text-white underline">#stasis</a>!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-50 overflow-hidden font-mono bg-[linear-gradient(var(--color-brown-900),var(--color-brown-900)),url(/noise-smooth-dark.png)] ${closing ? 'animate-[tamagotchi-fly-down_0.8s_cubic-bezier(0.16,1,0.2,1)_both]' : 'animate-[tamagotchi-fly-up_0.8s_cubic-bezier(0.16,1,0.2,1)_both]'}`}>
      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: 'max(17.5vh, 175px)', background: 'linear-gradient(to top, #34291E, #34291E00)' }} />

      {/* Grid texture */}
      <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: 'url(/grid-texture.png)', backgroundSize: '4rem 4rem', backgroundPosition: `${gridPos.x}px ${gridPos.y}px`, imageRendering: 'pixelated' }} />

      {/* Back button */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 2xl:top-8 2xl:left-8 z-30 transition-opacity duration-1000" style={{ opacity: showBackButton ? 1 : 0, pointerEvents: showBackButton ? 'auto' : 'none' }}>
        <MagneticCorners activationDistance={35} deactivationDistance={45}>
          <button onClick={handleClose} className="block bg-orange-600 p-2 md:p-4 2xl:p-6 relative cursor-pointer hover:bg-orange-400 transition-colors">
            <img src="/home-light.svg" alt="Back" className="w-8 h-8" />
          </button>
        </MagneticCorners>
      </div>

      {/* ===== TEXT + BUTTON (absolute centered, unaffected by squares layout) ===== */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-4 -mt-12 sm:-mt-16"
        style={{ pointerEvents: detailMode ? 'none' : undefined }}
      >
        {/* Title — flies up on detail */}
        <div style={{
          transform: detailMode ? 'translateY(-100vh)' : 'none',
          transition: 'transform 0.6s cubic-bezier(0.16,1,0.2,1)',
        }}>
          <h1 className="text-orange-500 text-2xl sm:text-4xl md:text-5xl font-bold uppercase tracking-wider text-center">
            <ScrambleText text={TITLE_TEXT} active={showTitle} totalDuration={1200} scrambleDuration={200} />
          </h1>
        </div>

        {/* Subtitle — flies up on detail */}
        <div style={{
          transform: detailMode ? 'translateY(-100vh)' : 'none',
          transition: 'transform 0.65s cubic-bezier(0.16,1,0.2,1) 0.05s',
        }}>
          <p className="mt-4 sm:mt-5 text-sm sm:text-lg md:text-xl uppercase tracking-wide leading-relaxed text-center max-w-3xl">
            <ScrambleText
              text={SUBTITLE_TEXT} active={showSubtitle} totalDuration={1500} scrambleDuration={200}
              renderChar={(char, index, visible, onHover) => {
                const hl = index >= HIGHLIGHT_START && index < HIGHLIGHT_END;
                return (
                  <span key={index} className={hl ? 'bg-orange-500 text-white cursor-pointer' : 'text-cream-300 cursor-default'}
                    style={{ visibility: visible ? 'visible' : 'hidden' }} onMouseEnter={onHover}
                    onClick={hl ? () => window.open('https://en.wikipedia.org/wiki/Tamagotchi', '_blank', 'noopener,noreferrer') : undefined}
                  >{char}</span>
                );
              }}
            />
          </p>
        </div>

        {/* Button — flickers in after text, flies up on detail */}
        <div
          className={`mt-12 sm:mt-16 ${showButton ? 'led-flicker-slow' : ''}`}
          style={{
            transform: detailMode ? 'translateY(-100vh)' : 'none',
            transition: 'transform 0.7s cubic-bezier(0.16,1,0.2,1) 0.08s',
            opacity: showButton ? undefined : 0,
            pointerEvents: showButton && !detailMode ? 'auto' : 'none',
          }}
        >
          <MagneticCorners offset={12}>
            <MagneticCorners mode="border" color="#D95D39" magnetStrength={0.025} hoverOffsetIncrease={1} hoverColor="#e89161">
              <button onClick={handleTellMeMore} className="relative bg-orange-500 hover:bg-[#e0643e] active:bg-[#d95d39] px-8 md:px-12 h-[50px] flex items-center justify-center cursor-pointer transition-colors">
                <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.08]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 3px)', backgroundSize: '100% 3px' }} />
                <span className="text-[18px] uppercase tracking-wider text-white whitespace-nowrap">Tell Me More</span>
              </button>
            </MagneticCorners>
          </MagneticCorners>
        </div>
      </div>

      {/* ===== SQUARES ===== */}
      <div className={`relative z-10 flex flex-col items-center justify-end h-full px-4 ${detailMode ? 'pb-16 sm:pb-24' : 'pb-[12vh] sm:pb-[14vh]'}`}>

        <div ref={squaresRef} style={{
          transform: squaresFlip != null ? `translateY(${squaresFlip}px)` : 'none',
          transition: squaresFlip === 0 ? 'transform 0.7s cubic-bezier(0.16,1,0.2,1)' : 'none',
        }}>
          <div className="relative flex items-center justify-center">

            {/* ===== LEFT EXTRA SQUARES (past days, detail mode only) — absolute so they don't shift center ===== */}
            {detailMode && pastVisible > 0 && (
              <div className="absolute right-full flex items-center">
                {pastOverflow > 0 && (
                  <span className="text-[9px] sm:text-[10px] text-cream-300/40 uppercase tracking-wide mr-2 whitespace-nowrap">
                    {status.pastDays.length} days since start
                  </span>
                )}
                {pastToShow.map((day, idx) => {
                  const fadeIdx = pastVisible - idx - 1; // 0 = closest to today
                  const opacity = fadeIdx >= 2 ? 0.2 : fadeIdx === 1 ? 0.4 : 0.7;
                  return (
                    <div key={`past-${day.date}`} className="flex items-center">
                      <div className="relative"
                        onMouseEnter={() => setHoveredSquare(day.date)}
                        onMouseLeave={() => setHoveredSquare(null)}
                      >
                        <div
                          className={`w-6 h-6 sm:w-8 sm:h-8 ${day.completed ? 'bg-orange-500' : 'bg-brown-900 border-2 border-[#4D4238]'}`}
                          style={{ opacity }}
                        />
                        {hoveredSquare === day.date && (
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] sm:text-[10px] text-cream-300 uppercase bg-brown-900 border border-[#4D4238] px-1 py-0.5 pointer-events-none led-flicker-slow z-10">
                            {fmtDate(day.date)}
                          </div>
                        )}
                      </div>
                      <div className="w-2 sm:w-4 h-0.5 bg-[#4D4238]" style={{ opacity: opacity * 0.5 }} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* ===== MAIN WINDOW SQUARES ===== */}
            {Array.from({ length: windowLen }, (_, i) => (
              <div key={i} className="flex items-center">
                {/* Connecting line (skip first, but add one if there are past squares) */}
                {(i > 0 || (detailMode && pastVisible > 0)) && i === 0 ? null : i > 0 && (
                  <div
                    key={`line-${i}-${linePulseKey}`}
                    className={`w-4 sm:w-12 h-1 ${getLineClass(i)}`}
                    style={linePulsing && detailMode ? {
                      animation: `line-pulse-orange 0.5s ease-in-out ${(i - 1) * 80}ms both`,
                    } : undefined}
                  />
                )}
                <div className="relative"
                  onMouseEnter={() => {
                    if (detailMode && status.windowDays[i]) setHoveredSquare(status.windowDays[i].date);
                  }}
                  onMouseLeave={() => detailMode && setHoveredSquare(null)}
                >
                  {visibleSquares > i ? (
                    <div
                      key={hopKeys[i]}
                      className={`w-10 h-10 sm:w-16 sm:h-16 relative overflow-hidden ${getWindowSquareClass(i)} ${hopKeys[i] === 0 ? 'shape-enter' : 'shape-pulse'}`}
                    >
                      {/* Emoticon faces (intro mode) */}
                      {!detailMode && squareFaces[i] && (
                        <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-bold text-white pointer-events-none">
                          {squareFaces[i]}
                        </span>
                      )}
                      {/* Day numbers (detail mode, not last square) */}
                      {detailMode && visibleNumbers > i && i < lastWindowIdx && (
                        <span className={`absolute inset-0 flex items-center justify-center text-lg sm:text-2xl font-bold led-flicker-slow ${
                          status.windowDays[i]?.completed ? 'text-white' :
                          status.windowDays[i]?.isToday ? 'text-orange-500' :
                          'text-cream-300/15'
                        }`}>
                          {i + 1}
                        </span>
                      )}
                      {/* Inner tamagotchi in last square (detail mode) */}
                      {detailMode && i === lastWindowIdx && innerTamaVisible && (
                        <img src="/tamagotchi.png" alt="" className="absolute left-1/2 w-7 h-7 sm:w-10 sm:h-10"
                          style={{
                            top: innerTamaSettled ? '50%' : '-50%',
                            transform: 'translateX(-50%) translateY(-50%)',
                            transition: 'top 0.8s cubic-bezier(0.16, 1, 0.2, 1)',
                            maxWidth: 'none',
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="w-10 h-10 sm:w-16 sm:h-16" />
                  )}

                  {/* Big floating tamagotchi (intro) */}
                  {i === lastWindowIdx && showTamagotchi && (
                    <div className="absolute left-1/2 led-flicker-slow"
                      style={{
                        bottom: '80%',
                        zIndex: tamaHidePhase >= 2 ? -1 : 1,
                        transition: tamaHidePhase > 0 ? 'transform 0.35s cubic-bezier(0.16, 1, 0.2, 1)' : 'none',
                        transform: tamaHidePhase === 0
                          ? 'translate(-50%, 0)'
                          : tamaHidePhase === 1
                            ? 'translate(-50%, -20%)'
                            : 'translate(-50%, 60%) scale(0.5)',
                      }}
                    >
                      <div ref={tama.elRef} style={{ willChange: 'transform' }}>
                        <img src="/tamagotchi.png" alt="Tamagotchi"
                          className={`object-contain select-none transition-[filter] duration-100 hover:drop-shadow-[0_0_12px_rgba(232,106,58,0.15)] ${tamaHidePhase === 0 ? 'animate-[tamagotchi-float_6s_ease-in-out_infinite]' : ''}`}
                          style={{ width: 64, height: 64, maxWidth: 'none', cursor: tama.isDragging ? 'grabbing' : 'grab' }}
                          onPointerDown={detailMode ? undefined : tama.onPointerDown}
                          onPointerMove={detailMode ? undefined : tama.onPointerMove}
                          onPointerUp={detailMode ? undefined : tama.onPointerUp}
                          draggable={false}
                        />
                      </div>
                    </div>
                  )}

                  {/* Date labels (detail mode) */}
                  {/* "Today" label follows the actual today square */}
                  {detailMode && i === todayIdx && (
                    <div className="absolute -top-10 left-1/2 whitespace-nowrap text-[10px] sm:text-xs text-cream-300 uppercase bg-brown-900 border border-[#4D4238] px-1.5 py-0.5 z-10"
                      style={{
                        transform: `translateX(-50%) translateY(${showFirstLabel ? '0px' : '10px'})`,
                        opacity: showFirstLabel ? 1 : 0,
                        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.2, 1)',
                      }}
                    >
                      Today ({fmtDate(status.windowDays[i]?.date ?? '')})
                    </div>
                  )}
                  {/* Last square label (goal date) — always visible, only if not also today */}
                  {detailMode && i === lastWindowIdx && todayIdx !== lastWindowIdx && (
                    <div className="absolute -top-10 left-1/2 whitespace-nowrap text-[10px] sm:text-xs text-cream-300 uppercase bg-brown-900 border border-[#4D4238] px-1.5 py-0.5 z-10"
                      style={{
                        transform: `translateX(-50%) translateY(${showLastLabel ? '0px' : '10px'})`,
                        opacity: showLastLabel ? 1 : 0,
                        transition: 'all 0.4s cubic-bezier(0.16, 1, 0.2, 1)',
                      }}
                    >
                      {fmtDate(status.windowDays[lastWindowIdx]?.date ?? '')}
                    </div>
                  )}
                  {/* Hover date label for all non-today, non-last squares */}
                  {detailMode && hoveredSquare === status.windowDays[i]?.date && i !== todayIdx && i !== lastWindowIdx && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] sm:text-xs text-cream-300 uppercase bg-brown-900 border border-[#4D4238] px-1.5 py-0.5 pointer-events-none led-flicker-slow z-10">
                      {fmtDate(status.windowDays[i].date)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* ===== RIGHT EXTRA SQUARES (future days after window, detail mode only) — absolute so they don't shift center ===== */}
            {detailMode && futureVisible > 0 && (
              <div className="absolute left-full flex items-center">
                {futureToShow.map((day, idx) => {
                  const opacity = idx >= 2 ? 0.2 : idx === 1 ? 0.4 : 0.7;
                  return (
                    <div key={`future-${day.date}`} className="flex items-center">
                      <div className="w-2 sm:w-4 h-0.5 bg-[#4D4238]" style={{ opacity: opacity * 0.5 }} />
                      <div className="relative"
                        onMouseEnter={() => setHoveredSquare(day.date)}
                        onMouseLeave={() => setHoveredSquare(null)}
                      >
                        <div
                          className="w-6 h-6 sm:w-8 sm:h-8 bg-brown-900 border-2 border-[#4D4238]"
                          style={{ opacity }}
                        />
                        {hoveredSquare === day.date && (
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] sm:text-[10px] text-cream-300 uppercase bg-brown-900 border border-[#4D4238] px-1 py-0.5 pointer-events-none led-flicker-slow z-10">
                            {fmtDate(day.date)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {futureOverflow > 0 && (
                  <span className="text-[9px] sm:text-[10px] text-cream-300/40 uppercase tracking-wide ml-4 whitespace-nowrap">
                    {status.windowDays.filter(d => d.isFuture).length + status.futureDays.length} days remaining
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== DETAIL TEXT ===== */}
      {detailMode && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[14vh] sm:top-[18vh] md:top-[20vh] z-20 w-full max-w-2xl px-6 sm:px-8"
          style={{
            transform: showDetailText ? 'translateY(0)' : 'translateY(-40px)',
            opacity: showDetailText ? 1 : 0,
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.2, 1)',
          }}
        >
          <h2 className="text-orange-500 text-lg sm:text-2xl md:text-3xl font-bold uppercase tracking-wider">
            The Tamagotchi Streak Challenge
          </h2>
          <p className="mt-4 sm:mt-5 text-cream-300 text-xs sm:text-sm md:text-base leading-relaxed uppercase tracking-wide">
            During the two weeks from <span className="text-orange-500">3/27</span> to <span className="text-orange-500">4/10</span>, post a journal entry every day. Hit a seven-day streak and we&apos;ll send you a real <a href="https://en.wikipedia.org/wiki/Tamagotchi" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">Tamagotchi pet</a>.
          </p>
          <p className="mt-3 text-cream-300 text-xs sm:text-sm md:text-base leading-relaxed uppercase tracking-wide">
            Make it count! Your entries should reflect real work, and we&apos;ll be rejecting those that don&apos;t. We&apos;ll be lenient, but don&apos;t try to cheat the system.
          </p>
          <p className="mt-3 text-cream-300 text-xs sm:text-sm md:text-base leading-relaxed uppercase tracking-wide">
            You have a streak of <span className="text-orange-500">{status.currentStreak}</span> days so far.{' '}
            <span className="text-orange-500">
              {status.todayProgress.hasJournal
                ? "You've posted a journal entry today and maintained your streak!"
                : "You haven't posted a journal entry yet today!"}
            </span>
            {' '}
            {status.todayProgress.hasJournal
              ? <>Nice job! You should share your update in{' '}
                  <a href="https://hackclub.enterprise.slack.com/archives/C09HSQM550A" target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">#stasis</a> :)</>
              : <>You have <span className="text-orange-500">{Math.max(1, 24 - new Date().getHours())}</span> hours left to maintain your streak! Don&apos;t forget ;)</>}
          </p>
          {status.todayProgress.complete && !status.challengeComplete && (
            <p className="mt-3 text-cream-300 text-xs sm:text-sm md:text-base leading-relaxed uppercase tracking-wide">
              Only <span className="text-orange-500">{7 - status.currentStreak}</span> days to go!
            </p>
          )}
          {!status.canStillComplete && !status.challengeComplete && (
            <p className="mt-3 text-cream-300/60 text-xs sm:text-sm leading-relaxed uppercase tracking-wide">
              There are fewer than 7 days remaining in the event. You can no longer complete the streak, but keep building and journaling!
            </p>
          )}
        </div>
      )}
    </div>
  );
}
