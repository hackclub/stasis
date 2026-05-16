'use client';

import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'inventory-welcome-seen';
const HELP_HIDDEN_STORAGE_KEY = 'inventory-help-hidden';
const VIDEO_URL = 'https://user-cdn.hackclub-assets.com/019e2c6a-da36-72b6-bc8e-cb9e088ce6f9/Cap%202026-05-15%20at%2000.24.40.mp4';

export function InventoryWelcomeModal() {
  const [open, setOpen] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [helpHidden, setHelpHidden] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const shouldHideHelp = localStorage.getItem(HELP_HIDDEN_STORAGE_KEY) === '1';
    const shouldOpen = !localStorage.getItem(STORAGE_KEY);

    queueMicrotask(() => {
      setHelpHidden(shouldHideHelp);
      setOpen(shouldOpen);
      setInitialized(true);
    });
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setOpen(false);
    setVideoStarted(false);
  };

  const openTutorial = () => {
    setVideoStarted(false);
    setOpen(true);
  };

  const hideHelpButton = () => {
    localStorage.setItem(HELP_HIDDEN_STORAGE_KEY, '1');
    setHelpHidden(true);
  };

  const startVideo = () => {
    setVideoStarted(true);
    videoRef.current?.play().catch(() => undefined);
  };

  if (!initialized) return null;

  if (!open) {
    if (helpHidden) return null;

    return (
      <div className="group fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={hideHelpButton}
          aria-label="Hide inventory help button"
          className="absolute -left-2 -top-2 hidden h-5 w-5 items-center justify-center border border-brown-800 bg-cream-100 text-[10px] font-bold text-brown-800 shadow group-hover:flex"
        >
          x
        </button>
        <button
          type="button"
          onClick={openTutorial}
          aria-label="Open inventory help video"
          className="flex h-9 w-9 items-center justify-center border-2 border-brown-800 bg-cream-100 text-sm font-bold text-brown-800 shadow-lg"
        >
          ?
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center font-mono">
      <div className="absolute inset-0 bg-[#3D3229]/80" onClick={dismiss} />
      <div className="relative bg-cream-100 border-2 border-brown-800 p-6 max-w-lg w-full mx-4">
        <h2 className="text-brown-800 font-bold text-sm uppercase tracking-wide mb-4">Welcome to Inventory</h2>
        <p className="mb-4 text-sm leading-relaxed text-brown-800">
          Hi! My name is Natey, I made the Stasis inventory system. It&apos;s a bit complicated, so if you want you can watch this video now, or later by clicking the little question mark at the bottom right (hover over it and click the little x to make it disappear).
        </p>
        <div className="relative">
          <video
            ref={videoRef}
            src={VIDEO_URL}
            controls
            playsInline
            preload="metadata"
            className="w-full border border-cream-400"
          />
          {!videoStarted && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#3D3229]/80">
              <button
                onClick={startVideo}
                className="px-4 py-2 text-sm uppercase tracking-wider border-2 border-cream-100 bg-cream-100 text-brown-800 hover:bg-cream-200 transition-colors cursor-pointer"
              >
                Start video
              </button>
            </div>
          )}
        </div>
        <button
          onClick={dismiss}
          className="mt-4 w-full px-4 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 bg-brown-800 text-cream-50 hover:bg-brown-700 transition-colors cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
