'use client';

import { useState } from 'react';

interface Project {
  id: string;
  name: string;
  hours: number;
  short_description: string;
  badges: string[];
  image?: string;
}

interface Props {
  project: Project;
  onClick?: () => void;
  selected?: boolean;
  tier?: number;
}

export function ProjectPreview({ project, onClick, selected = false, tier }: Readonly<Props>) {
  const [failed, setFailed] = useState(false);

  const src = project.image ? `/projects/${project.image}` : `/projects/${project.id}.png`;

  return (
    <>
      <style jsx>{`
        @keyframes selected-bounce {
          0% { transform: scale(1) rotate(0deg); }
          20% { transform: scale(0.97) rotate(0deg); }
          100% { transform: scale(1.05) rotate(1.5deg); }
        }

        img {
          transform: scale(1) rotate(0deg);
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        img.selected {
          animation: selected-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          transform: scale(1.05) rotate(1.5deg);
        }
      `}</style>
      <button
        className="aspect-square bg-brown-900 relative select-none w-full cursor-pointer overflow-hidden"
        data-project-card="true"
        onClick={onClick}
      >
        {!failed && (
          <img
            src={src}
            alt=""
            className={`w-full h-full inset-0 object-contain ${selected ? 'selected' : ''}`}
            style={{ filter: selected ? 'none' : 'grayscale(1)' }}
            draggable="false"
            onError={() => setFailed(true)}
          />
        )}
        {tier !== undefined && (
          <span className="absolute bottom-1 right-1 text-[0.6rem] md:text-xs font-mono text-cream-500/60 bg-brown-900/70 px-1.5 py-0.5 z-10">
            T{tier}
          </span>
        )}
      </button>
    </>
  );
}
