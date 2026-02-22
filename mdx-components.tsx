import type { MDXComponents } from 'mdx/types';
import { CodeBlock } from './app/components/CodeBlock';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="text-4xl font-bold text-orange-500 mb-6 mt-8">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-2xl font-bold text-cream-100 mb-4 mt-8 border-b border-cream-600 pb-2">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xl font-bold text-cream-200 mb-3 mt-6">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-lg font-bold text-cream-300 mb-2 mt-4">{children}</h4>
    ),
    p: ({ children }) => (
      <p className="text-cream-300 mb-4 leading-relaxed">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside text-cream-300 mb-4 space-y-1 ml-4">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside text-cream-300 mb-4 space-y-1 ml-4">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="text-cream-300">{children}</li>
    ),
    a: ({ href, children }) => (
      <a 
        href={href} 
        className="text-orange-500 hover:bg-orange-500 hover:text-cream-100 underline transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    code: ({ children, className }) => {
      if (className?.includes('language-')) {
        return <CodeBlock className={className}>{children as string}</CodeBlock>;
      }
      return (
        <code className="bg-brown-800 text-orange-400 px-1.5 py-0.5 rounded text-sm font-mono">
          {children}
        </code>
      );
    },
    pre: ({ children }) => <>{children}</>,
    img: ({ src, alt }) => (
      <img 
        src={src} 
        alt={alt || ''} 
        className="max-w-full h-auto rounded my-4 border-4 border-orange-500 mx-auto block"
      />
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-orange-500 pl-4 italic text-cream-400 my-4">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="border-cream-600 my-8" />,
    strong: ({ children }) => (
      <strong className="text-cream-100 font-bold">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="text-cream-200 italic">{children}</em>
    ),
    ...components,
  };
}
