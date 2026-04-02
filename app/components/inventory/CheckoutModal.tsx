'use client';

import { useState } from 'react';

interface CheckoutItem {
  itemId: string;
  name: string;
  quantity: number;
}

interface CheckoutTool {
  toolId: string;
  name: string;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CheckoutItem[];
  tools: CheckoutTool[];
  onConfirm: (floor: number, location: string) => void;
  isSubmitting?: boolean;
  venueFloors?: number;
  error?: string | null;
}

export function CheckoutModal({ isOpen, onClose, items, tools, onConfirm, isSubmitting, venueFloors = 3, error }: CheckoutModalProps) {
  const [floor, setFloor] = useState(1);
  const [location, setLocation] = useState('');

  if (!isOpen) return null;

  const canConfirm = location.trim().length > 0 && !isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-mono">
      <div className="absolute inset-0 bg-[#3D3229]/80" />
      <div className="relative bg-cream-100 border-2 border-brown-800 p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-6">Confirm Checkout</h2>

        {/* Parts summary */}
        {items.length > 0 && (
          <div className="mb-4">
            <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-2">Parts</h3>
            <ul className="space-y-1">
              {items.map(item => (
                <li key={item.itemId} className="flex justify-between text-sm text-brown-800">
                  <span>{item.name}</span>
                  <span className="text-brown-800/60">x{item.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tool rentals summary */}
        {tools.length > 0 && (
          <div className="mb-4">
            <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-2">Tool Rentals</h3>
            <ul className="space-y-1">
              {tools.map(tool => (
                <li key={tool.toolId} className="text-sm text-brown-800">{tool.name}</li>
              ))}
            </ul>
          </div>
        )}

        {(items.length > 0 || tools.length > 0) && <div className="border-t border-cream-400 mb-4" />}

        {/* Floor dropdown */}
        <div className="mb-4">
          <label className="block text-brown-800 text-sm uppercase tracking-wider mb-1">Floor</label>
          <select
            value={floor}
            onChange={e => setFloor(Number(e.target.value))}
            className="w-full border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-sm"
          >
            {Array.from({ length: venueFloors }, (_, i) => (
              <option key={i + 1} value={i + 1}>Floor {i + 1}</option>
            ))}
          </select>
        </div>

        {/* Location input */}
        <div className="mb-6">
          <label className="block text-brown-800 text-sm uppercase tracking-wider mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Room number or table"
            className="w-full border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-sm placeholder:text-brown-800/30"
          />
        </div>

        {error && (
          <div className="mb-4 border-2 border-red-600 bg-red-50 px-3 py-2 text-red-800 text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-cream-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(floor, location.trim())}
            disabled={!canConfirm}
            className="flex-1 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 bg-orange-500 text-cream-50 hover:bg-orange-600 disabled:opacity-30 disabled:hover:bg-orange-500 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
