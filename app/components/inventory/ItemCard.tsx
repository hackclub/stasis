'use client';

import { useState } from 'react';

interface ItemCardProps {
  item: {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    stock: number;
    category: string;
    maxPerTeam: number;
    teamUsed?: number;
  };
  onAdd: (itemId: string, quantity: number) => void;
}

export function ItemCard({ item, onAdd }: ItemCardProps) {
  const remaining = item.maxPerTeam - (item.teamUsed ?? 0);
  const canAdd = remaining > 0 && item.stock > 0;
  const maxQuantity = Math.min(remaining, item.stock);
  const [quantity, setQuantity] = useState(1);

  const decrement = () => setQuantity(q => Math.max(1, q - 1));
  const increment = () => setQuantity(q => Math.min(maxQuantity, q + 1));

  return (
    <div className="border-2 border-brown-800 bg-cream-100 p-4 flex flex-col">
      {/* Image */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="w-full h-40 object-cover border border-cream-400 mb-3"
        />
      ) : (
        <div className="w-full h-40 bg-cream-200 border border-cream-400 mb-3 flex items-center justify-center">
          <span className="text-brown-800/30 text-sm uppercase">No image</span>
        </div>
      )}

      {/* Category badge */}
      <span className="inline-block self-start px-2 py-0.5 text-xs uppercase tracking-wider bg-cream-200 border border-cream-400 text-brown-800/70 mb-2">
        {item.category}
      </span>

      {/* Name */}
      <h3 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-1">{item.name}</h3>

      {/* Description */}
      {item.description && (
        <p className="text-brown-800/60 text-xs mb-3 line-clamp-2">{item.description}</p>
      )}

      <div className="mt-auto">
        {/* Stock info */}
        <div className="flex justify-between text-xs text-brown-800/60 mb-3">
          <span>{item.stock} in stock</span>
          <span>{remaining} of {item.maxPerTeam} remaining</span>
        </div>

        {/* Quantity selector + Add button */}
        <div className="flex gap-2">
          <div className="flex items-center border-2 border-brown-800">
            <button
              onClick={decrement}
              disabled={!canAdd || quantity <= 1}
              className="px-2 py-1 text-brown-800 hover:bg-cream-200 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              -
            </button>
            <span className="px-3 py-1 text-sm text-brown-800 min-w-[2rem] text-center">
              {quantity}
            </span>
            <button
              onClick={increment}
              disabled={!canAdd || quantity >= maxQuantity}
              className="px-2 py-1 text-brown-800 hover:bg-cream-200 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              +
            </button>
          </div>
          <button
            onClick={() => { onAdd(item.id, quantity); setQuantity(1); }}
            disabled={!canAdd}
            className="flex-1 py-1 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-brown-800 hover:text-cream-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-brown-800 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
