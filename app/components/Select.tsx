'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional secondary line under the label in the open menu. */
  hint?: string;
  /** Optional Tailwind text-color class applied to this option's label (e.g. 'text-blue-300'). */
  tone?: string;
  disabled?: boolean;
}

/**
 * General admin dropdown. The trigger is styled like a native `<select>` so it
 * blends into dense admin forms; the open menu is a portaled, keyboard-
 * navigable list. For colorful Airtable-style single-selects, use ColorSelect.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  align = 'left',
  triggerRef: externalTriggerRef,
  ariaKeyshortcuts,
}: Readonly<{
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  align?: 'left' | 'right';
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  ariaKeyshortcuts?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  const setTriggerRef = (node: HTMLButtonElement | null) => {
    (triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    if (externalTriggerRef) {
      (externalTriggerRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    }
  };

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    function update() {
      const r = triggerRef.current!.getBoundingClientRect();
      setPosition({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  function commit(idx: number) {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function step(delta: 1 | -1) {
    if (options.length === 0) return;
    let next = highlight;
    for (let i = 0; i < options.length; i++) {
      next = Math.min(options.length - 1, Math.max(0, next + delta));
      if (!options[next]?.disabled) break;
      if (next === 0 || next === options.length - 1) break;
    }
    setHighlight(next);
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setHighlight(0); }
    else if (e.key === 'End') { e.preventDefault(); setHighlight(options.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(highlight); }
    else if (e.key === 'Tab') { setOpen(false); }
  }

  const borderCls = open ? 'border-orange-500' : 'border-cream-500/20';

  return (
    <>
      <button
        ref={setTriggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-keyshortcuts={ariaKeyshortcuts}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm border bg-brown-900 text-cream-50 cursor-pointer outline-none transition-colors duration-150 focus:border-orange-500 focus-visible:ring-1 focus-visible:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed ${borderCls}`}
      >
        <span className={`truncate min-w-0 text-left ${selected?.tone ?? ''}`}>
          {selected?.label ?? placeholder ?? '—'}
        </span>
        <Caret open={open} />
      </button>

      {open && position && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              id={listboxId}
              tabIndex={-1}
              style={{
                position: 'fixed',
                top: position.top,
                left:
                  align === 'right'
                    ? Math.max(8, position.left + position.width - Math.max(position.width, 200))
                    : position.left,
                minWidth: Math.max(position.width, 200),
                zIndex: 100,
              }}
              className="bg-brown-900 outline outline-1 -outline-offset-1 outline-cream-200/15 shadow-[0_8px_24px_rgba(0,0,0,0.5)] py-1 max-h-[60vh] overflow-y-auto"
            >
              {options.map((opt, i) => {
                const isSelected = opt.value === value;
                const isHighlight = i === highlight;
                const rowBg = opt.disabled
                  ? 'text-cream-400 cursor-not-allowed'
                  : isHighlight
                    ? 'bg-orange-500/15 text-orange-300'
                    : 'text-cream-100 hover:bg-orange-500/10';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseEnter={() => !opt.disabled && setHighlight(i)}
                    onClick={() => commit(i)}
                    className={`w-full text-left flex flex-col px-3 py-1.5 cursor-pointer outline-none transition-[background-color,color] duration-100 ${rowBg}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        aria-hidden
                        className={`text-xs leading-none w-2 ${isSelected ? 'text-orange-400' : 'invisible'}`}
                      >›</span>
                      <span className={`truncate text-sm ${opt.tone ?? ''}`}>{opt.label}</span>
                    </span>
                    {opt.hint ? (
                      <span className="block text-[11px] text-cream-400 truncate tabular-nums mt-0.5 pl-4">
                        {opt.hint}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <span
      className={`text-cream-300 text-[9px] tracking-widest leading-none transition-transform duration-200 ${
        open ? 'rotate-180' : ''
      }`}
      aria-hidden
    >▼</span>
  );
}
