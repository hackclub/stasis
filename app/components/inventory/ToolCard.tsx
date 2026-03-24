'use client';

interface ToolCardProps {
  tool: {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    available: boolean;
  };
  onRent: (toolId: string) => void;
}

export function ToolCard({ tool, onRent }: ToolCardProps) {
  return (
    <div className="border-2 border-brown-800 bg-cream-100 p-4 flex flex-col">
      {/* Image */}
      {tool.imageUrl ? (
        <img
          src={tool.imageUrl}
          alt={tool.name}
          className="w-full h-40 object-cover border border-cream-400 mb-3"
        />
      ) : (
        <div className="w-full h-40 bg-cream-200 border border-cream-400 mb-3 flex items-center justify-center">
          <span className="text-brown-800/30 text-sm uppercase">No image</span>
        </div>
      )}

      {/* Availability badge */}
      <span
        className={`inline-block self-start px-2 py-0.5 text-xs uppercase tracking-wider border mb-2 ${
          tool.available
            ? 'bg-green-100 border-green-600 text-green-800'
            : 'bg-cream-200 border-cream-400 text-brown-800/50'
        }`}
      >
        {tool.available ? 'Available' : 'Unavailable'}
      </span>

      {/* Name */}
      <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-1">{tool.name}</h3>

      {/* Description */}
      {tool.description && (
        <p className="text-brown-800/60 text-xs mb-3 line-clamp-2">{tool.description}</p>
      )}

      <div className="mt-auto">
        <button
          onClick={() => onRent(tool.id)}
          disabled={!tool.available}
          className="w-full py-2 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-brown-800 hover:text-cream-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-brown-800 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          Rent
        </button>
      </div>
    </div>
  );
}
