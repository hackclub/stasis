'use client';

import { useState, useEffect } from 'react';

interface ShopItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  price: number;
}

// Default prize to pre-select (Bambu Lab A1 Mini)
const DEFAULT_SELECTED_NAME = 'Bambu Lab A1 Mini';

interface Props {
  initialSelection?: string[];
  onConfirm: (selectedIds: string[]) => void;
  onBack: () => void;
}

export function PrizeGoalPicker({ initialSelection = [], onConfirm, onBack }: Readonly<Props>) {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection));
  const [loading, setLoading] = useState(true);
  const [defaultApplied, setDefaultApplied] = useState(false);

  useEffect(() => {
    fetch('/api/shop/items')
      .then(res => res.json())
      .then(({ items: shopItems }) => {
        setItems(shopItems ?? []);
        // Pre-select Bambu Lab A1 Mini by default if no initial selection
        if (initialSelection.length === 0 && !defaultApplied) {
          const defaultItem = (shopItems ?? []).find((i: ShopItem) => i.name === DEFAULT_SELECTED_NAME);
          if (defaultItem) {
            setSelected(new Set([defaultItem.id]));
          }
          setDefaultApplied(true);
        }
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div>
      <p className="text-brown-800 text-sm leading-relaxed mb-5">
        Pick the prizes you want to work toward. Your progress bar will track your bits toward these items.
      </p>

      {loading ? (
        <div className="p-8 text-center">
          <p className="text-brown-800">Loading prizes...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-cream-500 uppercase tracking-wide text-sm">No prizes available yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 min-[700px]:grid-cols-3 gap-3">
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggle(item.id)}
                className={`relative text-left border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/30'
                    : 'border-cream-400 hover:border-cream-500'
                }`}
              >
                {/* Selection overlay */}
                {isSelected && (
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    <div className="absolute top-2 right-2 w-6 h-6 bg-orange-500 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
                <div className={`aspect-video overflow-hidden border-b bg-cream-200 ${isSelected ? 'border-orange-500/30' : 'border-cream-400'}`}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-cream-500 text-xs uppercase tracking-wider">No image</span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h4 className={`font-medium text-sm mb-1 ${isSelected ? 'text-orange-500' : 'text-brown-800'}`}>{item.name}</h4>
                  <p className="text-brown-800 text-xs line-clamp-2 mb-1">{item.description}</p>
                  <p className="text-orange-400 font-bold text-sm">{item.price.toLocaleString()}&nbsp;Bits</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 mt-5">
        <button
          onClick={onBack}
          className="flex-1 bg-cream-300 hover:bg-cream-400 px-4 py-2 text-center cursor-pointer transition-colors"
        >
          <span className="text-brown-800 uppercase tracking-wide text-sm">Back</span>
        </button>
        <button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={selected.size === 0}
          className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-center cursor-pointer transition-colors"
        >
          <span className="text-cream-100 uppercase tracking-wide text-sm">
            Confirm{selected.size > 0 ? ` (${selected.size})` : ''}
          </span>
        </button>
      </div>
    </div>
  );
}
