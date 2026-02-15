'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface ScrambleOptions {
  duration?: number;
  charset?: string;
  staggerMax?: number;
  delayMax?: number;
  threshold?: number;
  triggerOnce?: boolean;
  trigger?: 'intersect' | 'visible';
}

interface CharData {
  element: HTMLSpanElement;
  original: string;
  isStatic: boolean;
  locked: boolean;
  lockTime: number;
}

const defaultOptions: Required<ScrambleOptions> = {
  duration: 0.7,
  charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*',
  staggerMax: 0.3,
  delayMax: 0.2,
  threshold: 0.2,
  triggerOnce: true,
  trigger: 'intersect'
};

export function useScramble<T extends HTMLElement>(options: ScrambleOptions = {}) {
  const ref = useRef<T>(null);
  const charactersRef = useRef<CharData[]>([]);
  const isAnimatingRef = useRef(false);
  const animationStartTimeRef = useRef(0);
  const hasTriggeredRef = useRef(false);
  const tickerCallbackRef = useRef<(() => void) | null>(null);

  const opts = { ...defaultOptions, ...options };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Capture original text before DOM manipulation for screen readers
    const originalText = node.textContent || '';

    // Hide the scrambled visual text from screen readers
    node.setAttribute('aria-hidden', 'true');

    // Insert an sr-only element with the original readable text
    const srOnly = document.createElement('span');
    srOnly.className = 'sr-only';
    srOnly.textContent = originalText;
    node.parentElement?.insertBefore(srOnly, node);

    const getRandomChar = (): string => {
      return opts.charset[Math.floor(Math.random() * opts.charset.length)];
    };

    const processTextNodes = (element: Node) => {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes: Text[] = [];
      let currentNode: Node | null;

      while ((currentNode = walker.nextNode())) {
        const text = currentNode.textContent || '';
        if (text.trim().length > 0) {
          textNodes.push(currentNode as Text);
        }
      }

      textNodes.forEach((textNode) => {
        const text = textNode.textContent || '';
        const fragment = document.createDocumentFragment();
        const chars = text.split('');

        chars.forEach((char, index) => {
          if (char === ' ') {
            fragment.appendChild(document.createTextNode(' '));
            return;
          }

          const span = document.createElement('span');

          const isStatic = /[^\w]/.test(char);
          const totalChars = chars.length;
          const lockTime = isStatic ? 0 : Math.random() * opts.delayMax + (index / totalChars) * opts.staggerMax;

          span.textContent = isStatic ? char : getRandomChar();
          fragment.appendChild(span);

          charactersRef.current.push({
            element: span,
            original: char,
            isStatic,
            locked: isStatic,
            lockTime: lockTime * 1000
          });
        });

        textNode.replaceWith(fragment);
      });
    };

    const scrambleChars = () => {
      if (!isAnimatingRef.current) return;

      const elapsed = Date.now() - animationStartTimeRef.current;
      let allLocked = true;

      for (const char of charactersRef.current) {
        if (char.isStatic) continue;

        if (!char.locked) {
          if (elapsed >= char.lockTime) {
            char.locked = true;
            char.element.textContent = char.original;
          } else {
            char.element.textContent = getRandomChar();
            allLocked = false;
          }
        }
      }

      if (allLocked && elapsed >= opts.duration * 1000) {
        stopAnimation();
      }
    };

    const startAnimation = () => {
      if (isAnimatingRef.current || (hasTriggeredRef.current && opts.triggerOnce)) return;

      hasTriggeredRef.current = true;
      isAnimatingRef.current = true;
      animationStartTimeRef.current = Date.now();

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

    processTextNodes(node);

    let observer: IntersectionObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    if (opts.trigger === 'intersect') {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              startAnimation();
              if (opts.triggerOnce) {
                observer?.disconnect();
              }
            }
          });
        },
        { threshold: opts.threshold }
      );

      observer.observe(node);
    } else if (opts.trigger === 'visible') {
      const checkVisibility = () => {
        const isVisible = node.offsetParent !== null &&
          window.getComputedStyle(node).display !== 'none' &&
          window.getComputedStyle(node).visibility !== 'hidden';

        if (isVisible) {
          startAnimation();
          if (opts.triggerOnce) {
            mutationObserver?.disconnect();
          }
        }
      };

      mutationObserver = new MutationObserver(() => {
        checkVisibility();
      });

      mutationObserver.observe(node.parentElement || document.body, {
        attributes: true,
        childList: true,
        subtree: true
      });

      setTimeout(checkVisibility, 0);
    }

    return () => {
      stopAnimation();
      observer?.disconnect();
      mutationObserver?.disconnect();
      srOnly.remove();
    };
  }, []);

  return ref;
}
