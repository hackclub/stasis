'use client';

import { useEffect, useRef, useState } from 'react';

// KiCanvas exposes <kicanvas-embed> and <kicanvas-source> custom elements.
// They aren't in React's JSX type list, so declare them here for TSX use.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'kicanvas-embed': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          controls?: 'none' | 'basic' | 'full';
          controlslist?: string;
          theme?: 'kicad' | 'witchhazel';
          zoom?: string;
        },
        HTMLElement
      >;
      'kicanvas-source': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { src?: string },
        HTMLElement
      >;
    }
  }
}

const KICANVAS_SCRIPT_SRC = 'https://kicanvas.org/kicanvas/kicanvas.js';

// Load the KiCanvas module script exactly once per page. Stored on window so
// React Strict Mode double-invocation and route remounts don't insert it twice.
declare global {
  interface Window {
    __kicanvasScriptLoaded?: boolean;
  }
}

function ensureKiCanvasLoaded() {
  if (typeof window === 'undefined') return;
  if (window.__kicanvasScriptLoaded) return;
  if (document.querySelector(`script[src="${KICANVAS_SCRIPT_SRC}"]`)) {
    window.__kicanvasScriptLoaded = true;
    return;
  }
  const script = document.createElement('script');
  script.type = 'module';
  script.src = KICANVAS_SCRIPT_SRC;
  script.async = true;
  document.head.appendChild(script);
  window.__kicanvasScriptLoaded = true;
}

export interface KiCanvasEmbedProps {
  /** Fully-qualified URLs (e.g. raw.githubusercontent.com) to KiCad files. */
  sources: ReadonlyArray<string>;
  controls?: 'none' | 'basic' | 'full';
  /** Height for the embed. Defaults to 520px. */
  height?: number;
}

export default function KiCanvasEmbed({
  sources,
  controls = 'full',
  height = 520,
}: Readonly<KiCanvasEmbedProps>) {
  const [mounted, setMounted] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    ensureKiCanvasLoaded();
    setMounted(true);
  }, []);

  if (!mounted || sources.length === 0) {
    return (
      <div
        className="w-full bg-brown-900 border border-cream-500/10 flex items-center justify-center text-cream-200 text-xs"
        style={{ height }}
      >
        Loading KiCanvas...
      </div>
    );
  }

  return (
    <div
      className="w-full bg-brown-900 border border-cream-500/10 overflow-hidden"
      style={{ height }}
    >
      <kicanvas-embed
        controls={controls}
        theme="witchhazel"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {sources.map((src) => (
          <kicanvas-source key={src} src={src} />
        ))}
      </kicanvas-embed>
    </div>
  );
}
