/**
 * Small key-cap badge for inline keyboard-shortcut hints.
 *
 * Used in tight contexts like field labels ("Hours Override ⌃H") and toolbar
 * footers ("/ search · j/k nav"). Sized to sit in a row of body text without
 * pushing the baseline around.
 */
export function Kbd({ children, className = '' }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <kbd className={`inline-flex items-center px-1.5 py-px bg-brown-800 text-cream-200 text-xs tabular-nums ${className}`}>
      {children}
    </kbd>
  );
}
