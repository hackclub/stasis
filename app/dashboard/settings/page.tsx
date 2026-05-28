'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut, linkOAuth2 } from "@/lib/auth-client";
import { ToggleSwitch } from '@/app/components/ToggleSwitch';
import { useRoles, Role } from "@/lib/hooks/useRoles";

export default function SettingsPage() {
  const { data: session } = useSession();
  const { hasRole, isLoading: rolesLoading } = useRoles();
  const isAdmin = !rolesLoading && hasRole(Role.ADMIN);
  const [hackatimeLinked, setHackatimeLinked] = useState<boolean | null>(null);
  const [disableGrain, setDisableGrain] = useState<boolean | null>(null);
  const [reviewerUiOld, setReviewerUiOld] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkHackatime() {
      try {
        const res = await fetch('/api/hackatime/projects');
        setHackatimeLinked(res.ok);
      } catch {
        setHackatimeLinked(false);
      }
    }
    async function fetchGrainPref() {
      try {
        const res = await fetch('/api/user/grain');
        if (res.ok) {
          const data = await res.json();
          setDisableGrain(data.disableGrain);
        }
      } catch {
        setDisableGrain(false);
      }
    }
    async function fetchReviewerUi() {
      try {
        const res = await fetch('/api/user/reviewer-ui');
        if (res.ok) {
          const data = await res.json();
          setReviewerUiOld(!!data.useOld);
        }
      } catch {
        setReviewerUiOld(false);
      }
    }
    if (session) {
      checkHackatime();
      fetchGrainPref();
      if (isAdmin) fetchReviewerUi();
    }
  }, [session, isAdmin]);

  if (!session) {
    return null;
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="bg-cream-100 border-2 border-cream-400 p-6 space-y-6">
        <div>
          <h2 className="text-orange-500 text-xl uppercase mb-4">Account</h2>
          <div className="space-y-3">
            <div>
              <p className="text-brown-800 text-xs uppercase">Email</p>
              <p className="text-brown-800">{session.user.email}</p>
            </div>
            {session.user.name && (
              <div>
                <p className="text-brown-800 text-xs uppercase">Name</p>
                <p className="text-brown-800">{session.user.name}</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-cream-400 pt-6">
          <h2 className="text-orange-500 text-xl uppercase mb-4">Hackatime</h2>
          <p className="text-brown-800 text-sm mb-3">
            Link your Hackatime account to automatically track firmware coding time on your projects.
          </p>
          {hackatimeLinked === null ? (
            <div className="loader" style={{ width: 12, height: 18 }} />
          ) : hackatimeLinked ? (
            <div className="flex items-center gap-3">
              <span className="text-green-600 text-sm flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Hackatime account linked
              </span>
            </div>
          ) : (
            <button
              onClick={() => linkOAuth2({ providerId: "hackatime", callbackURL: "/dashboard/settings" })}
              className="bg-orange-500 hover:bg-orange-400 px-4 py-2 text-sm uppercase tracking-wider text-white transition-colors cursor-pointer"
            >
              Link Hackatime Account
            </button>
          )}
        </div>

        <div className="border-t border-cream-400 pt-6">
          <h2 className="text-orange-500 text-xl uppercase mb-4">Appearance</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-brown-800 text-sm font-medium">Disable grain effect</p>
              <p className="text-brown-600 text-xs">Turn off the animated film grain overlay on platform pages.</p>
            </div>
            {disableGrain === null ? (
              <div className="loader" style={{ width: 12, height: 18 }} />
            ) : (
              <ToggleSwitch
                checked={disableGrain}
                label="Disable grain effect"
                onChange={async (newValue) => {
                  setDisableGrain(newValue);
                  localStorage.setItem('disableGrain', String(newValue));
                  window.dispatchEvent(new CustomEvent('grain-preference-changed', { detail: { disabled: newValue } }));
                  await fetch('/api/user/grain', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ disableGrain: newValue }),
                  });
                }}
              />
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="border-t border-cream-400 pt-6">
            <h2 className="text-orange-500 text-xl uppercase mb-4">Review UI (Admin)</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-brown-800 text-sm font-medium">Use old review page</p>
                <p className="text-brown-600 text-xs">When on, queue links open the original /old layout instead of the redesigned one.</p>
              </div>
              {reviewerUiOld === null ? (
                <div className="loader" style={{ width: 12, height: 18 }} />
              ) : (
                <ToggleSwitch
                  checked={reviewerUiOld}
                  label="Use old review page"
                  onChange={async (newValue) => {
                    setReviewerUiOld(newValue);
                    await fetch('/api/user/reviewer-ui', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ useOld: newValue }),
                    });
                  }}
                />
              )}
            </div>
          </div>
        )}

        <div className="border-t border-cream-400 pt-6">
          <h2 className="text-orange-500 text-xl uppercase mb-4">Session</h2>
          <button
            onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = '/' } } })}
            className="w-full bg-red-600/20 hover:bg-red-600/30 border-2 border-red-600/50 px-6 py-3 text-lg uppercase tracking-wider text-red-500 transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
