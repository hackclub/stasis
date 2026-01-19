'use client';

interface Props {
  onClick: () => void
}

export function NewProjectCard({ onClick }: Readonly<Props>) {
  return (
    <button 
      className="bg-cream-950 relative select-none w-full cursor-pointer overflow-hidden flex flex-col items-center justify-center border-2 border-dashed border-cream-600 hover:border-brand-500 hover:bg-cream-900 transition-colors group min-h-[280px]"
      onClick={onClick}
    >
      <div className="text-cream-300 group-hover:text-brand-500 transition-colors">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="48" 
          height="48" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <p className="text-cream-300 group-hover:text-brand-500 text-sm font-mono uppercase mt-2 transition-colors">
        New Project
      </p>
    </button>
  )
}
