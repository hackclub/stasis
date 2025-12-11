'use client';

interface Project {
  id: string;
  name: string;
  hours: number;
  short_description: string;
  badges: string[];
}

interface Props {
  project: Project;
  onClick?: () => void;
  selected?: boolean;
}

export function ProjectPreview({ project, onClick, selected = false }: Readonly<Props>) {
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
        className="aspect-square bg-cream-950 relative select-none w-full cursor-pointer overflow-hidden" 
        data-project-card="true" 
        onClick={onClick}
      >
        <img 
          src={`/projects/${project.id}-gray.png`} 
          alt="" 
          className={`w-full h-full inset-0 ${selected ? 'selected' : ''}`}
          draggable="false"
        />
      </button>
    </>
  );
}
