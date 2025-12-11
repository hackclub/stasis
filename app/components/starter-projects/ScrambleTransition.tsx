'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

interface Props {
  text: string;
  duration?: number;
  charset?: string;
  scrambleSpeed?: number;
  className?: string;
}

interface CharData {
  current: string;
  locked: boolean;
  lockTime: number;
}

export function ScrambleTransition({
  text,
  duration = 0.6,
  charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?.,;:',
  scrambleSpeed = 30,
  className = ''
}: Readonly<Props>) {
  const [characters, setCharacters] = useState<CharData[]>([]);
  const isAnimatingRef = useRef(false);
  const animationStartTimeRef = useRef(0);
  const tickerCallbackRef = useRef<(() => void) | null>(null);
  const previousTextRef = useRef('');
  const targetTextRef = useRef('');

  const displayText = characters.map(c => c.current).join('');

  const getRandomChar = (): string => {
    return charset[Math.floor(Math.random() * charset.length)];
  };

  const easeOutCubic = (t: number): number => {
    return 1 - Math.pow(1 - t, 3);
  };

  const initializeTransition = (from: string, to: string) => {
    const maxLength = Math.max(from.length, to.length);
    
    const newChars = Array.from({ length: maxLength }, (_, i) => {
      const delay = (i / maxLength) * 0.4;
      const lockTime = delay + duration * 0.3;
      
      const fromChar = i < from.length ? from[i] : '';
      
      return {
        current: fromChar === ' ' ? getRandomChar() : fromChar,
        locked: false,
        lockTime: lockTime * 1000
      };
    });
    
    setCharacters(newChars);
  };

  const scrambleChars = () => {
    if (!isAnimatingRef.current) return;

    const elapsed = Date.now() - animationStartTimeRef.current;
    const progress = Math.min(elapsed / (duration * 1000), 1);
    const easedProgress = easeOutCubic(progress);
    
    const currentLength = Math.round(
      previousTextRef.current.length + (targetTextRef.current.length - previousTextRef.current.length) * easedProgress
    );

    setCharacters(prev => {
      let allLocked = true;
      const newChars = prev.map((char, i) => {
        if (i >= currentLength) {
          return { ...char, current: '', locked: false };
        }

        if (!char.locked) {
          if (elapsed >= char.lockTime) {
            return { 
              ...char, 
              locked: true, 
              current: i < targetTextRef.current.length ? targetTextRef.current[i] : '' 
            };
          } else {
            allLocked = false;
            return { ...char, current: getRandomChar() };
          }
        }
        return char;
      });

      if (allLocked && progress >= 1) {
        stopAnimation();
        return targetTextRef.current.split('').map(c => ({
          current: c,
          locked: true,
          lockTime: 0
        }));
      }

      return newChars;
    });
  };

  const startAnimation = (from: string, to: string) => {
    if (from === to) return;
    
    stopAnimation();
    
    previousTextRef.current = from;
    targetTextRef.current = to;
    isAnimatingRef.current = true;
    animationStartTimeRef.current = Date.now();
    
    initializeTransition(from, to);
    
    tickerCallbackRef.current = scrambleChars;
    gsap.ticker.add(tickerCallbackRef.current);
  };

  const stopAnimation = () => {
    isAnimatingRef.current = false;
    if (tickerCallbackRef.current) {
      gsap.ticker.remove(tickerCallbackRef.current);
      tickerCallbackRef.current = null;
    }
  };

  useEffect(() => {
    if (text !== displayText && !isAnimatingRef.current) {
      startAnimation(displayText || '', text);
    }
  }, [text]);

  useEffect(() => {
    return () => {
      stopAnimation();
    };
  }, []);

  return (
    <span className={`inline break-words overflow-wrap-break-word whitespace-normal max-w-full ${className}`}>
      {displayText || text}
    </span>
  );
}
