'use client';

import { useEffect } from 'react';
import type { HotkeyBinding } from '@/lib/hotkeys';

interface Props {
  open: boolean;
  bindings: HotkeyBinding[];
  onClose: () => void;
}

// Renders the bindings grouped by `group`. Closes on Escape or backdrop click.
// Sharp corners, single Departure Mono size, console aesthetic per .impeccable.md.
export default function HotkeyOverlay({ open, bindings, onClose }: Readonly<Props>) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const grouped = new Map<string, HotkeyBinding[]>();
  for (const b of bindings) {
    const key = b.group ?? 'General';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(b);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-brown-900/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-brown-800 border border-cream-500/30 max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-cream-500/20">
          <h2 className="text-cream-50 text-sm uppercase tracking-wider font-bold">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-cream-200 hover:text-cream-50 text-xs uppercase tracking-wider cursor-pointer"
          >
            Esc to close
          </button>
        </div>

        <div className="space-y-5">
          {[...grouped.entries()].map(([group, list]) => (
            <div key={group}>
              <p className="text-orange-400 text-[10px] uppercase tracking-wider mb-2">{group}</p>
              <div className="space-y-1">
                {list.map((b) => (
                  <div key={b.key} className="flex items-center justify-between gap-4">
                    <span className="text-cream-100 text-xs">{b.description}</span>
                    <kbd className="text-cream-200 text-[10px] uppercase tracking-wider bg-brown-900 border border-cream-500/20 px-2 py-0.5">
                      {formatKey(b.key)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatKey(k: string): string {
  return k
    .replace('$mod', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
    .replace(/\+/g, ' + ');
}
