'use client';

import { useEffect, useRef } from 'react';
import hljs from 'highlight.js';

interface CodeBlockProps {
  children: string;
  className?: string;
}

export function CodeBlock({ children, className }: Readonly<CodeBlockProps>) {
  const codeRef = useRef<HTMLElement>(null);
  const language = className?.replace('language-', '') || '';

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current);
    }
  }, [children]);

  return (
    <pre className="!bg-[#0d1117] overflow-x-auto mb-4 p-4">
      <code ref={codeRef} className={`language-${language} text-sm font-mono`}>
        {children}
      </code>
    </pre>
  );
}
