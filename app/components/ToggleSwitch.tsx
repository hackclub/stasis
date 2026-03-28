'use client';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 border-2 transition-colors cursor-pointer ${
        checked
          ? 'bg-orange-500 border-orange-600'
          : 'bg-cream-300 border-cream-400'
      }`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span
        className={`absolute top-1/2 -translate-y-1/2 left-0.5 w-4 h-4 bg-cream-100 transition-all ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}
