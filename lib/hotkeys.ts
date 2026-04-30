'use client';

import { useEffect } from 'react';
// tinykeys ships types but doesn't expose them via package.json `exports`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- types resolved at runtime, see node_modules/tinykeys/dist/tinykeys.d.ts
import { tinykeys } from 'tinykeys';

export interface HotkeyBinding {
  key: string;            // tinykeys-style binding e.g. "$mod+Enter", "Shift+R", "j"
  description: string;    // for the overlay
  group?: string;         // overlay grouping label
  runInInputs?: boolean;  // if true, fires even when an input/textarea is focused
  handler: () => void;
}

/**
 * Bind a set of keyboard shortcuts. Suppresses bindings while focus is in an
 * input/textarea/contenteditable unless the binding opts in via `runInInputs`.
 * Also suppresses everything when `disabled` is true (e.g. while a modal is open).
 */
export function useHotkeys(bindings: HotkeyBinding[], disabled?: boolean): void {
  useEffect(() => {
    if (disabled) return;

    const map: Record<string, (e: KeyboardEvent) => void> = {};
    for (const b of bindings) {
      map[b.key] = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const inInput =
          !!target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable);
        if (inInput && !b.runInInputs) return;
        e.preventDefault();
        b.handler();
      };
    }
    return tinykeys(window, map);
  }, [bindings, disabled]);
}
