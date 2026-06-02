'use client';

import { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js';
import { fetchCadFileContent } from '@/lib/cad-fetch';

const EXT_TO_LANG: Record<string, string> = {
  '.ino': 'cpp', '.c': 'c', '.cpp': 'cpp', '.h': 'c',
  '.py': 'python', '.rs': 'rust', '.js': 'javascript',
  '.ts': 'typescript', '.scad': 'openscad',
};

export default function CodeViewer({
  url,
  extension,
}: Readonly<{ url: string; extension: string }>) {
  const codeRef = useRef<HTMLElement>(null);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true); setError(null); setCode(null);

    (async () => {
      try {
        const buf = await fetchCadFileContent(url, ctrl.signal);
        if (cancelled) return;
        setCode(new TextDecoder().decode(buf));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load file');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [url]);

  useEffect(() => {
    if (code && codeRef.current) {
      codeRef.current.textContent = code;
      hljs.highlightElement(codeRef.current);
    }
  }, [code]);

  if (loading) {
    return <div className="flex items-center justify-center text-cream-300 text-xs h-full bg-brown-950">Loading...</div>;
  }
  if (error) {
    return <div className="flex items-center justify-center text-red-400 text-xs p-4 h-full bg-brown-950">{error}</div>;
  }

  const lang = EXT_TO_LANG[extension.toLowerCase()] ?? '';

  return (
    <div className="h-full overflow-auto bg-brown-950">
      <pre className="bg-brown-950 p-3 m-0 text-xs leading-relaxed">
        <code ref={codeRef} className={lang ? `language-${lang}` : ''}>
          {code}
        </code>
      </pre>
    </div>
  );
}
