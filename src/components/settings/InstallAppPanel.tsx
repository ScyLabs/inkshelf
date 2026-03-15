'use client';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export default function InstallAppPanel() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [inFarcaster, setInFarcaster] = useState(false);
  const [miniAppAdded, setMiniAppAdded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { default: sdk } = await import('@farcaster/frame-sdk');
        const ctx = await sdk.context;
        if (ctx) {
          setInFarcaster(true);
          // Check if user already added the mini app
          if (ctx.client?.added) {
            setMiniAppAdded(true);
          }
        }
      } catch {
        // Not in Farcaster context
      }
    })();
  }, []);

  useEffect(() => {
    if (installed || inFarcaster) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setInstalled(true);

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [installed, inFarcaster]);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else if (isIOS()) {
      setShowIOSGuide((v) => !v);
    }
  }, [deferredPrompt]);

  const handleAddMiniApp = useCallback(async () => {
    try {
      const { default: sdk } = await import('@farcaster/frame-sdk');
      await sdk.actions.addMiniApp();
      setMiniAppAdded(true);
    } catch {
      // User rejected or already added
    }
  }, []);

  // Farcaster context: show "Add Mini App" only if not already added
  if (inFarcaster) {
    if (miniAppAdded) return null;

    return (
      <button
        type="button"
        onClick={handleAddMiniApp}
        className="flex w-full items-center gap-3 rounded-xl bg-zinc-900 p-4"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500 shrink-0">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        <div className="text-left">
          <p className="text-sm text-white">Add Mini App</p>
          <p className="text-xs text-zinc-500">Add to your Farcaster apps</p>
        </div>
      </button>
    );
  }

  // PWA context
  if (installed) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-zinc-900 p-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p className="text-sm text-zinc-400">App installed</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <button
        type="button"
        onClick={handleInstall}
        className="flex w-full items-center gap-3"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500 shrink-0">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <div className="text-left">
          <p className="text-sm text-white">Install App</p>
          <p className="text-xs text-zinc-500">
            {isIOS() ? 'Add to Home Screen' : 'Install as app on your device'}
          </p>
        </div>
      </button>

      {showIOSGuide && (
        <div className="mt-3 rounded-lg bg-zinc-800 p-3 text-xs text-zinc-400 space-y-1">
          <p>To install on iOS:</p>
          <p>1. Tap the <strong className="text-white">Share</strong> button (↑) in Safari</p>
          <p>2. Scroll down and tap <strong className="text-white">Add to Home Screen</strong></p>
          <p>3. Tap <strong className="text-white">Add</strong></p>
        </div>
      )}
    </div>
  );
}
