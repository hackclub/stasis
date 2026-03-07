'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface TextSegment {
  text: string;
  class?: string;
  href?: string;
}

interface Props {
  segments: TextSegment[];
  charset?: string;
  iterations?: number;
  speed?: number;
  rippleRadius?: number;
  initialScramble?: boolean;
  initialDuration?: number;
  initialStagger?: number;
  initialDelay?: number;
  continuousScramble?: boolean;
  continuousSpeed?: number;
  continuousCharset?: string;
  className?: string;
  srLabel?: string;
}

interface CharState {
  original: string;
  current: string;
  animating: boolean;
  iteration: number;
  segmentClass: string;
  href?: string;
}

export function HoverScramble({
  segments,
  charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*',
  iterations = 7,
  speed = 10,
  rippleRadius = 1,
  initialScramble = false,
  initialDuration = 1.2,
  initialStagger = 0.6,
  initialDelay = 0.4,
  continuousScramble = false,
  continuousSpeed = 150,
  continuousCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*',
  className = '',
  srLabel,
}: Readonly<Props>) {
  const getRandomChar = useCallback(
    (customCharset?: string): string => {
      const charsetToUse = customCharset || charset;
      return charsetToUse[Math.floor(Math.random() * charsetToUse.length)];
    },
    [charset]
  );

  const initializeCharacters = useCallback((): CharState[] => {
    const chars: CharState[] = [];
    segments.forEach((segment) => {
      segment.text.split('').forEach((char) => {
        chars.push({
          original: char,
          current: char,
          animating: false,
          iteration: 0,
          segmentClass: segment.class || '',
          href: segment.href,
        });
      });
    });
    return chars;
  }, [segments]);

  const [characters, setCharacters] = useState<CharState[]>(initializeCharacters);
  const timeoutRefs = useRef<Map<number, number>>(new Map());

  const scrambleChar = useCallback(
    (index: number) => {
      setCharacters((prev) => {
        const char = prev[index];
        if (!char || char.animating || char.original === ' ' || /[^\w]/.test(char.original)) {
          return prev;
        }

        const newChars = [...prev];
        newChars[index] = { ...char, animating: true, iteration: 0 };
        return newChars;
      });

      const runIteration = (currentIteration: number) => {
        if (currentIteration < iterations) {
          setCharacters((prev) => {
            const newChars = [...prev];
            newChars[index] = {
              ...prev[index],
              current: getRandomChar(),
              iteration: currentIteration + 1,
            };
            return newChars;
          });

          const delay = speed * Math.pow(1.2, currentIteration + 1);
          const timeoutId = window.setTimeout(() => runIteration(currentIteration + 1), delay);
          timeoutRefs.current.set(index, timeoutId);
        } else {
          setCharacters((prev) => {
            const newChars = [...prev];
            newChars[index] = {
              ...prev[index],
              current: prev[index].original,
              animating: false,
            };
            return newChars;
          });
          timeoutRefs.current.delete(index);
        }
      };

      runIteration(0);
    },
    [iterations, speed, getRandomChar]
  );

  const handleHover = useCallback(
    (index: number) => {
      scrambleChar(index);

      for (
        let i = Math.max(0, index - rippleRadius);
        i <= Math.min(characters.length - 1, index + rippleRadius);
        i++
      ) {
        if (i !== index) {
          const distance = Math.abs(i - index);
          const capturedIndex = i;
          setTimeout(() => scrambleChar(capturedIndex), distance * 15);
        }
      }
    },
    [scrambleChar, rippleRadius, characters.length]
  );

  useEffect(() => {
    if (initialScramble) {
      const animationStartTime = Date.now();
      let animationFrameId: number;

      const scrambleInitial = () => {
        const elapsed = Date.now() - animationStartTime;

        setCharacters((prev) => {
          const newChars = [...prev];
          let allLocked = true;

          for (let i = 0; i < newChars.length; i++) {
            const char = newChars[i];

            if (char.original === ' ' || /[^\w]/.test(char.original)) continue;

            const lockTime =
              Math.random() * initialDelay * 1000 + (i / newChars.length) * initialStagger * 1000;

            if (elapsed >= lockTime) {
              newChars[i] = { ...char, current: char.original };
            } else {
              newChars[i] = { ...char, current: getRandomChar() };
              allLocked = false;
            }
          }

          return newChars;
        });

        if (elapsed < initialDuration * 1000) {
          animationFrameId = requestAnimationFrame(scrambleInitial);
        }
      };

      animationFrameId = requestAnimationFrame(scrambleInitial);

      return () => {
        cancelAnimationFrame(animationFrameId);
      };
    }
  }, [initialScramble, initialDelay, initialStagger, initialDuration, getRandomChar]);

  useEffect(() => {
    if (!continuousScramble) return;

    const continuousInterval = window.setInterval(() => {
      setCharacters((prev) => {
        const newChars = [...prev];
        let changed = false;

        for (let i = 0; i < newChars.length; i++) {
          const char = newChars[i];

          if (char.animating || char.original === ' ' || /[^\w]/.test(char.original)) continue;
          if (char.segmentClass.includes('text-brown-800')) continue;

          if (Math.random() < 0.3) {
            newChars[i] = { ...char, current: getRandomChar(continuousCharset) };
            changed = true;
          }
        }

        return changed ? newChars : prev;
      });
    }, continuousSpeed);

    return () => {
      clearInterval(continuousInterval);
    };
  }, [continuousScramble, continuousSpeed, continuousCharset, getRandomChar]);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      timeoutRefs.current.clear();
    };
  }, []);

  const accessibleText = srLabel ?? segments
    .filter((s) => s.class)
    .map((s) => s.text)
    .join('. ');

  return (
    <>
      {accessibleText && <p className="sr-only">{accessibleText}</p>}
      <div className={className} aria-hidden="true">
        {(() => {
          const elements: React.ReactNode[] = [];
          let i = 0;
          while (i < characters.length) {
            const char = characters[i];
            const idx = i;
            if (char.href) {
              // Group consecutive chars with the same href into a single <a>
              const href = char.href;
              const linkChars: { char: CharState; index: number }[] = [];
              while (i < characters.length && characters[i].href === href) {
                linkChars.push({ char: characters[i], index: i });
                i++;
              }
              elements.push(
                <a
                  key={`link-${linkChars[0].index}`}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link cursor-pointer"
                >
                  {linkChars.map(({ char: c, index }) => (
                    <span
                      key={index}
                      className={`${c.segmentClass} group-hover/link:!text-orange-500`}
                      onMouseEnter={() => handleHover(index)}
                    >
                      {c.current}
                    </span>
                  ))}
                </a>
              );
            } else if (char.original === '\n') {
              elements.push(<br key={idx} />);
              i++;
            } else if (char.original === '\t') {
              elements.push(<span key={idx} className={char.segmentClass}>{'\u00A0\u00A0\u00A0\u00A0'}</span>);
              i++;
            } else if (char.original === ' ') {
              elements.push(<span key={idx} className={char.segmentClass}>{char.current}</span>);
              i++;
            } else {
              elements.push(
                <span
                  key={idx}
                  className={`cursor-default ${char.segmentClass}`}
                  onMouseEnter={() => handleHover(idx)}
                >
                  {char.current}
                </span>
              );
              i++;
            }
          }
          return elements;
        })()}
      </div>
    </>
  );
}
