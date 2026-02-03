'use client';

import { useState } from 'react';
import { MagneticCorners } from './MagneticCorners';
import { authClient } from '@/lib/auth-client';

interface RSVPModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RSVPModal({ isOpen, onClose }: Readonly<RSVPModalProps>) {
  const [email, setEmail] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  async function handleContinue() {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    if (!ageConfirmed) {
      setError('Please confirm you are between 13-18 years old');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/rsvp/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error('Failed to start RSVP');
      }

      await authClient.signIn.oauth2({
        providerId: 'hca',
        callbackURL: '/api/rsvp/callback',
      });
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-[#3D3229]/80"
        onClick={onClose}
      />
      
      <div className="relative bg-cream-100 border-2 border-cream-800 p-8 max-w-md w-full mx-4 shadow-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-cream-800 hover:text-brand-500 text-2xl leading-none cursor-pointer"
        >
          ×
        </button>

        <h2 className="text-xl uppercase tracking-wide mb-6 text-cream-800">RSVP for Stasis</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm uppercase tracking-wide mb-1 text-cream-800">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-cream-50 border border-cream-600 text-cream-800 placeholder:text-cream-600 focus:outline-none focus:border-brand-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <p className="text-sm text-cream-700 mb-2">
              Stasis is for high schoolers only!
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-500 cursor-pointer"
              />
              <span className="text-sm text-cream-800">
                I confirm I am between 13-18 years old
              </span>
            </label>
          </div>

          {error && (
            <p className="text-brand-500 text-sm">{error}</p>
          )}

          <div className="pt-4">
            <MagneticCorners offset={8}>
              <MagneticCorners mode="border" color="var(--color-brand-500)" magnetStrength={0.025} hoverOffsetIncrease={1} hoverColor="var(--color-brand-400)">
                <button
                  onClick={handleContinue}
                  disabled={isSubmitting}
                  className="relative w-full bg-brand-500 hover:bg-brand-400 px-6 py-3 text-lg uppercase tracking-wider text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px] min-w-[320px]"
                >
                  <span className={isSubmitting ? 'invisible' : ''}>Continue with Hack Club Auth</span>
                  {isSubmitting && <span className="absolute inset-0 flex items-center justify-center">Loading...</span>}
                </button>
              </MagneticCorners>
            </MagneticCorners>
          </div>

          <p className="text-xs text-cream-700 text-center mt-4">
            You&apos;ll be redirected to Hack Club Auth to finish signing up.
          </p>
        </div>
      </div>
    </div>
  );
}
