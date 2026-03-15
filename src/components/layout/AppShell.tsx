'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useProgressStore, flushPendingPush, startSyncPolling, stopSyncPolling } from '../../stores/progressStore';
import { flushPendingSettingsPush } from '../../stores/settingsStore';
import { useUserStore } from '../../stores/userStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { pushLibraryAction, pushSettings, syncProgressToServer } from '../../services/api';
import type { AppSettings, ReadingProgress } from '../../types';

function BookIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function NavItem({ href, exact, children, label }: { href: string; exact?: boolean; children: React.ReactNode; label: string }) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 text-[11px] font-medium transition-all duration-300 ${
        isActive ? 'text-ink-cyan' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <div className={`relative rounded-xl p-2 transition-all duration-300 ${
        isActive ? 'bg-ink-cyan/10 shadow-[0_0_12px_rgba(0,212,255,0.15)]' : ''
      }`}>
        {children}
        {isActive && (
          <div className="absolute -bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-ink-cyan shadow-[0_0_6px_rgba(0,212,255,0.5)]" />
        )}
      </div>
      <span>{label}</span>
    </Link>
  );
}

async function migrateLocalStorage(userId: string): Promise<void> {
  const rawProgress = localStorage.getItem('op-reader-progress');
  const rawSettings = localStorage.getItem('op-reader-settings');

  let oldProgress: Record<string, ReadingProgress> = {};
  if (rawProgress) {
    try {
      const parsed = JSON.parse(rawProgress);
      oldProgress = parsed.state?.progress ?? {};
    } catch { /* ignore */ }
  }

  let oldSettings: AppSettings | null = null;
  if (rawSettings) {
    try {
      const parsed = JSON.parse(rawSettings);
      oldSettings = parsed.state ?? null;
    } catch { /* ignore */ }
  }

  if (Object.keys(oldProgress).length > 0) {
    await syncProgressToServer(userId, oldProgress);
  }

  if (oldSettings) {
    await pushSettings(userId, oldSettings);
  }

  const slugs = new Set<string>();
  for (const p of Object.values(oldProgress)) {
    if (p.mangaSlug) slugs.add(p.mangaSlug);
  }
  await Promise.all(
    Array.from(slugs).map((slug) => pushLibraryAction(userId, 'add', slug))
  );

  localStorage.removeItem('op-reader-progress');
  localStorage.removeItem('op-reader-settings');
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isReaderPage = pathname.startsWith('/read/');
  const isHydrated = useProgressStore((s) => s.isHydrated);
  const hydrateFromServer = useProgressStore((s) => s.hydrateFromServer);
  const lastRead = useProgressStore((s) => {
    const all = Object.values(s.progress);
    if (all.length === 0) return undefined;
    return all.reduce((latest, p) =>
      p.lastReadAt > latest.lastReadAt ? p : latest
    );
  });
  const userId = useUserStore((s) => s.userId);
  const updateLastUse = useUserStore((s) => s.updateLastUse);
  const resetLibrary = useLibraryStore((s) => s.reset);
  const hasSynced = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const prevUserId = prevUserIdRef.current;
    prevUserIdRef.current = userId;

    if (prevUserId && prevUserId !== userId) {
      stopSyncPolling();
      flushPendingPush();
      flushPendingSettingsPush();
      resetLibrary();
      hydrateFromServer(userId)
        .then(() => startSyncPolling(userId))
        .catch(() => {});
    } else if (!hasSynced.current) {
      hasSynced.current = true;

      const hasOldData =
        typeof window !== 'undefined' &&
        localStorage.getItem('op-reader-progress') !== null;

      if (hasOldData) {
        migrateLocalStorage(userId)
          .then(() => hydrateFromServer(userId))
          .then(() => startSyncPolling(userId))
          .catch(() => {});
      } else {
        hydrateFromServer(userId)
          .then(() => startSyncPolling(userId))
          .catch(() => {});
      }

      updateLastUse(userId);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          hydrateFromServer(userId)
            .then(() => startSyncPolling(userId))
            .catch(() => { startSyncPolling(userId); });
        }, 1500);
      } else {
        stopSyncPolling();
        flushPendingPush();
        flushPendingSettingsPush();
      }
    }

    function onPageHide() {
      flushPendingPush();
      flushPendingSettingsPush();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      stopSyncPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [userId, hydrateFromServer, updateLastUse, resetLibrary]);

  const readingLink = lastRead
    ? `/read/${lastRead.mangaSlug}/${lastRead.chapterSlug}`
    : '/';

  return (
    <div className="flex flex-col h-dvh bg-ink-bg text-white pt-[env(safe-area-inset-top)]">
      <main className={`flex-1 overflow-y-auto ${isReaderPage ? '' : 'pb-[env(safe-area-inset-bottom)]'}`}>
        {!isHydrated ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-border border-t-ink-cyan" />
              <span className="text-xs text-zinc-500">Loading...</span>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
      {!isReaderPage && (
        <nav className="glass-strong flex items-center justify-around px-4 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <NavItem href="/" exact label="Library">
            <BookIcon />
          </NavItem>
          <NavItem href={readingLink} label="Reading">
            <EyeIcon />
          </NavItem>
          <NavItem href="/settings" label="Settings">
            <GearIcon />
          </NavItem>
        </nav>
      )}
    </div>
  );
}
