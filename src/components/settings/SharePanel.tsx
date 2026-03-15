'use client';

import { useState, useEffect, useCallback } from 'react';

export default function SharePanel() {
  const [inFarcaster, setInFarcaster] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { default: sdk } = await import('@farcaster/frame-sdk');
        const ctx = await sdk.context;
        if (ctx) setInFarcaster(true);
      } catch {
        // Not in Farcaster context
      }
    })();
  }, []);

  const handleShare = useCallback(async () => {
    try {
      const { default: sdk } = await import('@farcaster/frame-sdk');
      await sdk.actions.composeCast({
        text: 'Free manga reader — 12,000+ titles in FR & EN 📖\n\nNo ads. No account. No tracking.\nPick up where you left off, syncs across devices, works offline.',
        embeds: ['https://farcaster.xyz/miniapps/jpxasvdZv9Lg/manga-reader'],
      });
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    } catch {
      // Fallback: copy link
      await navigator.clipboard?.writeText('https://farcaster.xyz/miniapps/jpxasvdZv9Lg/manga-reader');
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    }
  }, []);

  if (!inFarcaster) return null;

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex w-full items-center gap-3 rounded-xl bg-zinc-900 p-4"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500 shrink-0">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
      <div className="text-left">
        <p className="text-sm text-white">
          {shared ? 'Shared! 🎉' : 'Share on Farcaster'}
        </p>
        <p className="text-xs text-zinc-500">Spread the word</p>
      </div>
    </button>
  );
}
