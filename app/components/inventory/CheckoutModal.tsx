'use client';

import { useState } from 'react';

interface CheckoutItem {
  itemId: string;
  name: string;
  quantity: number;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CheckoutItem[];
  onConfirm: (floor: number, location: string) => void;
  isSubmitting?: boolean;
}

export function CheckoutModal({ isOpen, onClose, items, onConfirm, isSubmitting }: CheckoutModalProps) {
  const [floor, setFloor] = useState(1);
  const [location, setLocation] = useState('');

  if (!isOpen) return null;

  const canConfirm = location.trim().length > 0 && !isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center font-mono">
      <div className="absolute inset-0 bg-[#3D3229]/80" onClick={onClose} />
      <div className="relative bg-cream-100 border-2 border-brown-800 p-8 max-w-md w-full">
        <h2 className="text-brown-800 font-bold text-lg uppercase tracking-wide mb-6">Confirm Order</h2>

        {/* Order summary */}
        <div className="mb-6">
          <h3 className="text-brown-800 text-sm uppercase tracking-wider mb-2">Items</h3>
          <ul className="space-y-1">
            {items.map(item => (
              <li key={item.itemId} className="flex justify-between text-sm text-brown-800">
                <span>{item.name}</span>
                <span className="text-brown-800/60">x{item.quantity}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Floor dropdown */}
        <div className="mb-4">
          <label className="block text-brown-800 text-sm uppercase tracking-wider mb-1">Floor</label>
          <select
            value={floor}
            onChange={e => setFloor(Number(e.target.value))}
            className="w-full border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-sm"
          >
            <option value={1}>Floor 1</option>
            <option value={2}>Floor 2</option>
            <option value={3}>Floor 3</option>
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
