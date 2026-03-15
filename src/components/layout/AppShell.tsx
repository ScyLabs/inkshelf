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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function NavItem({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-1 text-xs transition-colors ${isActive ? 'text-white' : 'text-zinc-500'}`}
    >
      {children}
    </Link>
  );
}

async function migrateLocalStorage(userId: string): Promise<void> {
  // Read old progress data
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

  // Push progress to server
  if (Object.keys(oldProgress).length > 0) {
    await syncProgressToServer(userId, oldProgress);
  }

  // Push settings to server
  if (oldSettings) {
    await pushSettings(userId, oldSettings);
  }

  // Derive library slugs from progress and push each
  const slugs = new Set<string>();
  for (const p of Object.values(oldProgress)) {
    if (p.mangaSlug) slugs.add(p.mangaSlug);
  }
  await Promise.all(
    Array.from(slugs).map((slug) => pushLibraryAction(userId, 'add', slug))
  );

  // Only remove old localStorage keys after all pushes succeeded
  localStorage.removeItem('op-reader-progress');
  localStorage.removeItem('op-reader-settings');
}

export default function AppShell({ children }: { children: React.ReactNode }) {
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
      // UUID changed: flush pending to old user, reset stores, pull from new
      stopSyncPolling();
      flushPendingPush();
      flushPendingSettingsPush();
      resetLibrary();
      hydrateFromServer(userId)
        .then(() => startSyncPolling(userId))
        .catch(() => {});
    } else if (!hasSynced.current) {
      hasSynced.current = true;

      // Check for old localStorage data to migrate
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
        // Delay hydration to let any in-flight keepalive flushes reach the server
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
    ? `/read/${lastRead.mangaSlug ?? 'one_piece'}/${lastRead.chapterSlug}`
    : '/';

  return (
    <div className="flex flex-col h-dvh bg-black text-white pt-[env(safe-area-inset-top)]">
      <main className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        {!isHydrated ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />
          </div>
        ) : (
          children
        )}
      </main>
      <nav className="flex items-center justify-around border-t border-zinc-800 bg-zinc-950 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <NavItem href="/" exact>
          <BookIcon />
          <span>Library</span>
        </NavItem>
        <NavItem href={readingLink}>
          <EyeIcon />
          <span>Reading</span>
        </NavItem>
        <NavItem href="/settings">
          <GearIcon />
          <span>Settings</span>
        </NavItem>
      </nav>
    </div>
  );
}
