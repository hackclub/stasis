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
        className="absolute inset-0 bg-cream-800/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-[#DAD2BF] border-2 border-cream-800 p-8 max-w-md w-full mx-4 shadow-lg">
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
              className="w-full px-3 py-2 bg-cream-100 border border-cream-800/30 text-cream-800 placeholder:text-cream-800/50 focus:outline-none focus:border-brand-500"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <p className="text-brand-500 text-sm">{error}</p>
          )}

          <div className="pt-4">
            <MagneticCorners offset={8}>
              <MagneticCorners mode="border" color="#D95D39" magnetStrength={0.025} hoverOffsetIncrease={1} hoverColor="#e89161">
                <button
                  onClick={handleContinue}
                  disabled={isSubmitting}
                  className="relative w-full bg-brand-500 hover:bg-[#e0643e] px-6 py-3 text-lg uppercase tracking-wider text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[52px] min-w-[320px]"
                >
                  <span className={isSubmitting ? 'invisible' : ''}>Continue with Hack Club Auth</span>
                  {isSubmitting && <span className="absolute inset-0 flex items-center justify-center">Loading...</span>}
                </button>
              </MagneticCorners>
            </MagneticCorners>
          </div>

          <p className="text-xs text-cream-800/70 text-center mt-4">
            You&apos;ll be redirected to Hack Club Auth to finish signing up.
          </p>
        </div>
      </div>
    </div>
  );
}
