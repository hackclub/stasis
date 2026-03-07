'use client';

import { useState } from 'react';

const PRONOUN_OPTIONS = ['he/him', 'she/her', 'they/them'] as const;

interface Props {
  onComplete: () => void;
}

export function PronounsModal({ onComplete }: Readonly<Props>) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch('/api/user/pronouns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pronouns: selected }),
      });
      if (res.ok) {
        onComplete();
      } else {
        setSaving(false);
      }
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[#3D3229]/80" />
      <div className="relative bg-cream-100 border-2 border-orange-500 p-6 max-w-110 w-full mx-4 shadow-2xl">
        <p className="text-brown-800 text-sm leading-relaxed mb-5">
          What pronouns do you use?
        </p>

        <div className="flex flex-col gap-3 mb-5">
          {PRONOUN_OPTIONS.map((pronoun) => (
            <label
              key={pronoun}
              className="flex items-center gap-3 cursor-pointer text-brown-800 text-sm"
            >
              <input
                type="radio"
                name="pronouns"
                value={pronoun}
                checked={selected === pronoun}
                onChange={() => setSelected(pronoun)}
                className="w-4 h-4 accent-orange-500 cursor-pointer"
              />
              {pronoun}
            </label>
          ))}
        </div>

        <button
          onClick={handleContinue}
          disabled={!selected || saving}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
