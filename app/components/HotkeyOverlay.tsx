'use client';

import { useEffect } from 'react';
import type { HotkeyBinding } from '@/lib/hotkeys';

interface Props {
  open: boolean;
  bindings: HotkeyBinding[];
  onClose: () => void;
}

// Console-style help. Groups in column-flow so the panel stays compact on
// wide screens (we have many shortcuts now). Closes on Escape or backdrop.
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

  // Preserve first-seen order of groups so the overlay matches the binding
  // declaration order in the host page.
  const groupOrder: string[] = [];
  const grouped = new Map<string, HotkeyBinding[]>();
  for (const b of bindings) {
    const key = b.group ?? 'General';
    if (!grouped.has(key)) {
      grouped.set(key, []);
      groupOrder.push(key);
    }
    grouped.get(key)!.push(b);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-brown-900/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-brown-800 border border-cream-500/30 max-w-4xl w-full p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-cream-500/20">
          <div>
            <h2 className="text-cream-50 text-sm uppercase tracking-wider font-bold">Keyboard Shortcuts</h2>
            <p className="text-cream-200 text-[10px] uppercase tracking-wider mt-0.5">
              Shortcuts fire outside inputs unless noted. Press <Kbd>Esc</Kbd> to blur an input.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-cream-200 hover:text-cream-50 text-xs uppercase tracking-wider cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
          >
            Esc to close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {groupOrder.map((group) => {
            const list = grouped.get(group)!;
            return (
              <div key={group} className="break-inside-avoid">
                <p className="text-orange-400 text-[10px] uppercase tracking-wider mb-2">{group}</p>
                <div className="space-y-1.5">
                  {list.map((b) => (
                    <div key={b.key} className="flex items-baseline justify-between gap-4">
                      <span className="text-cream-100 text-xs">{b.description}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {renderKey(b.key)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Render a tinykeys-style binding string ("g j", "$mod+Enter", "Shift+Digit1")
// as a row of kbd elements with separators between modifier+key clusters and
// "then" arrows between sequence steps.
function renderKey(binding: string) {
  const presses = binding.trim().split(/\s+/);
  return (
    <>
      {presses.map((press, pi) => {
        const parts = press.split('+').map(formatPart);
        return (
          <span key={pi} className="flex items-center gap-1">
            {pi > 0 && <span className="text-cream-500 text-[10px]">then</span>}
            {parts.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-cream-500 text-[10px]">+</span>}
                <Kbd>{p}</Kbd>
              </span>
            ))}
          </span>
        );
      })}
    </>
  );
}

function formatPart(part: string): string {
  if (part === '$mod') {
    return typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
  }
  if (part === 'Shift') return 'Shift';
  if (part === 'Alt') return typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌥' : 'Alt';
  if (part === 'Control') return 'Ctrl';
  if (part === 'Meta') return '⌘';
  if (part === 'ArrowUp') return '↑';
  if (part === 'ArrowDown') return '↓';
  if (part === 'ArrowLeft') return '←';
  if (part === 'ArrowRight') return '→';
  if (part === 'Enter') return 'Enter';
  if (part === 'Escape') return 'Esc';
  if (part === 'Space') return 'Space';
  // KeyboardEvent.code values map to user-facing labels
  if (/^Digit\d$/.test(part)) return part.slice(5);
  if (/^Key[A-Z]$/.test(part)) return part.slice(3);
  return part.toUpperCase();
}

function Kbd({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <kbd className="text-cream-50 text-[10px] uppercase tracking-wider bg-brown-900 border border-cream-500/30 px-1.5 py-0.5 min-w-[1.5rem] text-center inline-block leading-none">
      {children}
    </kbd>
  );
}
