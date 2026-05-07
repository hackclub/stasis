'use client';

import { useState } from 'react';

interface Props {
  onComplete: () => void;
}

type YesNo = 'yes' | 'no';

interface QuestionProps {
  value: YesNo | null;
  onChange: (value: YesNo) => void;
  name: string;
}

function YesNoChoice({ value, onChange, name }: Readonly<QuestionProps>) {
  return (
    <div className="flex gap-3">
      {(['yes', 'no'] as const).map((opt) => (
        <label
          key={opt}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 border-2 cursor-pointer text-sm uppercase tracking-wider transition-colors ${
            value === opt
              ? 'border-orange-500 bg-orange-500 text-white'
              : 'border-cream-400 bg-cream-100 text-brown-800 hover:bg-cream-200'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="sr-only"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

export function StasisAttendanceModal({ onComplete }: Readonly<Props>) {
  const [interested, setInterested] = useState<YesNo | null>(null);
  const [planning, setPlanning] = useState<YesNo | null>(null);
  const [saving, setSaving] = useState(false);

  const canSubmit = interested !== null && planning !== null && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/user/stasis-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interested: interested === 'yes',
          planning: planning === 'yes',
        }),
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
      <div className="absolute inset-0 bg-black/75" />
      <div className="relative bg-cream-100 border-2 border-orange-500 p-6 max-w-110 w-full mx-4 shadow-2xl">
        <h2 className="text-orange-500 text-lg uppercase tracking-wide mb-4">
          Quick check-in
        </h2>

        <div className="mb-5">
          <p className="text-brown-800 text-sm mb-1">
            Do you <span className="text-orange-500">want</span> to come to Stasis in-person on May 15th–18th?
          </p>
          <p className="text-brown-800/70 text-xs mb-3">
            We want to give everyone a shot, so answer honestly even if you haven&apos;t qualified.
          </p>
          <YesNoChoice value={interested} onChange={setInterested} name="interested" />
        </div>

        <div className="mb-6">
          <p className="text-brown-800 text-sm mb-1">
            Are you currently planning on making it to Stasis?
          </p>
          <p className="text-brown-800/70 text-xs mb-3">
            If you&apos;re unsure, but you&apos;re attempting to, respond with &lsquo;Yes&rsquo; :)
          </p>
          <YesNoChoice value={planning} onChange={setPlanning} name="planning" />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
        >
          {saving ? 'Saving...' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
