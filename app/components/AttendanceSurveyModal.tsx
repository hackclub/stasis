'use client';

import { useState } from 'react';

const ATTENDANCE_OPTIONS = [
  'Yes! (If I can)',
  'Maybe, I\'m still thinking about it',
  'I\'m not coming',
  'I\'m trying to go to Open Sauce instead',
  'I\'m just working towards prizes',
] as const;

interface Props {
  onComplete: () => void;
}

export function AttendanceSurveyModal({ onComplete }: Readonly<Props>) {
  const [selected, setSelected] = useState<string | null>(null);
  const [helpText, setHelpText] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [saving, setSaving] = useState(false);

  const needsHelpText = selected === 'Maybe, I\'m still thinking about it';
  const needsReasonText = selected === 'I\'m not coming';
  const followUpFilled = needsHelpText
    ? helpText.trim().length > 0
    : needsReasonText
      ? reasonText.trim().length > 0
      : true;

  const canSubmit = selected && followUpFilled && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/user/attendance-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendance: selected,
          helpText: needsHelpText ? helpText : undefined,
          reasonText: needsReasonText ? reasonText : undefined,
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
        <p className="text-brown-800 text-sm leading-relaxed mb-5">
          Are you planning on attending Stasis in-person?
        </p>

        <div className="flex flex-col gap-3 mb-4">
          {ATTENDANCE_OPTIONS.map((option) => (
            <label
              key={option}
              className="flex items-center gap-3 cursor-pointer text-brown-800 text-sm"
            >
              <input
                type="radio"
                name="attendance"
                value={option}
                checked={selected === option}
                onChange={() => setSelected(option)}
                className="w-4 h-4 accent-orange-500 cursor-pointer shrink-0"
              />
              {option}
            </label>
          ))}
        </div>

        {/* Conditional follow-up text areas with smooth animation */}
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            maxHeight: needsHelpText ? '200px' : '0px',
            opacity: needsHelpText ? 1 : 0,
          }}
        >
          <div className="mb-4">
            <label className="block text-brown-800 text-sm mb-1.5">
              What can we do to help you come?
            </label>
            <textarea
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              className="w-full border border-brown-800/30 bg-white p-2 text-sm text-brown-800 resize-none focus:outline-none focus:border-orange-500 transition-colors"
              rows={3}
              placeholder="Let us know..."
            />
          </div>
        </div>

        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            maxHeight: needsReasonText ? '200px' : '0px',
            opacity: needsReasonText ? 1 : 0,
          }}
        >
          <div className="mb-4">
            <label className="block text-brown-800 text-sm mb-1.5">
              Reason for not coming
            </label>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              className="w-full border border-brown-800/30 bg-white p-2 text-sm text-brown-800 resize-none focus:outline-none focus:border-orange-500 transition-colors"
              rows={3}
              placeholder="Let us know..."
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 text-sm uppercase tracking-wider transition-colors cursor-pointer"
        >
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
