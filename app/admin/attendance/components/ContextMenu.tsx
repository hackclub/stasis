'use client';

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type SwatchColor = 'emerald' | 'blue' | 'purple' | 'pink' | 'orange' | 'yellow' | 'cream';

export interface MenuItem {
  type?: 'item' | 'separator' | 'submenu';
  label?: string;
  onSelect?: () => void;
  hint?: string;        // small right-aligned annotation (e.g. "↗" for opens-new-tab)
  disabled?: boolean;
  danger?: boolean;     // red-tinted (e.g. Remove)
  swatchColor?: SwatchColor; // small leading colored square (e.g. owner color)
  children?: MenuItem[]; // for type: 'submenu'
}

const SWATCH_BG: Record<SwatchColor, string> = {
  emerald: 'bg-emerald-400',
  blue:    'bg-sky-400',
  purple:  'bg-violet-400',
  pink:    'bg-pink-400',
  orange:  'bg-orange-500',
  yellow:  'bg-yellow-500',
  cream:   'bg-cream-200',
};

/** Right-click context menu for kanban cards. */
export function ContextMenu({
  x, y, items, onClose,
}: Readonly<{ x: number; y: number; items: MenuItem[]; onClose: () => void }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [hoveredSubmenu, setHoveredSubmenu] = useState<number | null>(null);

  // Reposition if the menu would overflow the viewport
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x, ny = y;
    if (x + r.width > vw - 8) nx = vw - r.width - 8;
    if (y + r.height > vh - 8) ny = vh - r.height - 8;
    if (nx < 8) nx = 8;
    if (ny < 8) ny = 8;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // Close on outside click / Escape / scroll
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onScroll() { onClose(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="attendance-context-menu fixed z-[9999] min-w-[220px] bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] py-1 font-sans"
      role="menu"
    >
      {items.map((it, i) => <MenuRow key={i} item={it} index={i} hovered={hoveredSubmenu === i} setHovered={setHoveredSubmenu} onClose={onClose} />)}
    </div>,
    document.body
  );
}

function MenuRow({ item, index, hovered, setHovered, onClose }: Readonly<{
  item: MenuItem;
  index: number;
  hovered: boolean;
  setHovered: (i: number | null) => void;
  onClose: () => void;
}>) {
  if (item.type === 'separator') {
    return <div className="my-1 mx-2 border-t border-cream-200/10" aria-hidden />;
  }
  if (item.type === 'submenu' && item.children) {
    return (
      <SubmenuRow item={item} index={index} hovered={hovered} setHovered={setHovered} onClose={onClose} />
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        if (item.disabled) return;
        item.onSelect?.();
        onClose();
      }}
      onMouseEnter={() => setHovered(null)}
      className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm cursor-pointer transition-[background-color,color] duration-100 ${
        item.disabled
          ? 'text-cream-400 cursor-not-allowed'
          : item.danger
            ? 'text-red-300 hover:bg-red-500/15'
            : 'text-cream-100 hover:bg-orange-500/15 hover:text-orange-300'
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        {item.swatchColor ? (
          <span aria-hidden className={`shrink-0 size-2.5 ${SWATCH_BG[item.swatchColor]}`} />
        ) : null}
        <span className="truncate text-left">{item.label}</span>
      </span>
      {item.hint ? <span className="text-xs text-cream-400 shrink-0">{item.hint}</span> : null}
    </button>
  );
}

function SubmenuRow({ item, index, hovered, setHovered, onClose }: Readonly<{
  item: MenuItem;
  index: number;
  hovered: boolean;
  setHovered: (i: number | null) => void;
  onClose: () => void;
}>) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [submenuPos, setSubmenuPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!hovered) {
      setSubmenuPos(null);
      return;
    }
    const r = rowRef.current?.getBoundingClientRect();
    if (!r) return;
    setSubmenuPos({ x: r.right - 2, y: r.top - 4 });
  }, [hovered]);

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={() => setHovered(index)}
    >
      <div
        className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-sm cursor-default ${hovered ? 'bg-orange-500/15 text-orange-300' : 'text-cream-100'}`}
      >
        <span className="truncate text-left">{item.label}</span>
        <span className="text-xs text-cream-400 shrink-0" aria-hidden>▸</span>
      </div>
      {hovered && submenuPos && item.children ? (
        <Submenu x={submenuPos.x} y={submenuPos.y} items={item.children} onClose={onClose} />
      ) : null}
    </div>
  );
}

function Submenu({ x, y, items, onClose }: Readonly<{ x: number; y: number; items: MenuItem[]; onClose: () => void }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x, ny = y;
    if (x + r.width > vw - 8) nx = x - r.width - 4;  // flip to left side
    if (y + r.height > vh - 8) ny = vh - r.height - 8;
    if (nx < 8) nx = 8;
    if (ny < 8) ny = 8;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  return createPortal(
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[10000] min-w-[200px] bg-brown-900 outline outline-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] py-1 font-sans"
    >
      {items.map((it, i) => (
        <MenuRow key={i} item={it} index={-1} hovered={false} setHovered={() => {}} onClose={onClose} />
      ))}
    </div>,
    document.body
  );
}

/** Wrapper hook for simpler call sites — manages open/close state + position. */
export function useContextMenu(): {
  open: (e: React.MouseEvent, items: MenuItem[]) => void;
  menu: ReactNode;
} {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  return {
    open: (e, items) => {
      e.preventDefault();
      e.stopPropagation();
      setState({ x: e.clientX, y: e.clientY, items });
    },
    menu: state ? (
      <ContextMenu x={state.x} y={state.y} items={state.items} onClose={() => setState(null)} />
    ) : null,
  };
}
