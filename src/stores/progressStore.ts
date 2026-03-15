import { create } from 'zustand';
import type { ReadingProgress } from '../types';
import { fetchProgressFromServer, fetchSyncCheck, fetchUserState, pushBatchProgress, pushLibraryAction, pushSingleProgress, syncProgressToServer } from '../services/api';
import { useUserStore } from './userStore';
import { useSettingsStore } from './settingsStore';

interface ProgressState {
  progress: Record<string, ReadingProgress>;
  followedSlugs: string[];
  favoriteSlugs: string[];
  isHydrated: boolean;
  lastSyncedAt: number | null;
  seenChapterCounts: Record<string, number>;
  updateProgress: (mangaSlug: string, chapterSlug: string, update: Partial<ReadingProgress>) => void;
  markCompleted: (mangaSlug: string, chapterSlug: string) => void;
  markBatchCompleted: (mangaSlug: string, chapterSlugs: string[]) => void;
  getProgress: (mangaSlug: string, chapterSlug: string) => ReadingProgress | undefined;
  getLastRead: () => ReadingProgress | undefined;
  getLastReadForManga: (mangaSlug: string) => ReadingProgress | undefined;
  getMangaProgress: (mangaSlug: string) => Record<string, ReadingProgress>;
  setSeenChapterCount: (mangaSlug: string, count: number) => void;
  toggleFavorite: (mangaSlug: string) => void;
  followManga: (mangaSlug: string) => void;
  unfollowManga: (mangaSlug: string) => void;
  hydrateFromServer: (userId: string) => Promise<void>;
  syncFromServer: (userId: string) => Promise<void>;
  syncToServer: (userId: string) => Promise<void>;
}

function progressKey(mangaSlug: string, chapterSlug: string): string {
  return `${mangaSlug}/${chapterSlug}`;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPush: { userId: string; mangaSlug: string; chapterSlug: string; update: Partial<ReadingProgress> } | null = null;

function debouncedServerPush(userId: string, mangaSlug: string, chapterSlug: string, update: Partial<ReadingProgress>) {
  const key = progressKey(mangaSlug, chapterSlug);
  // Flush previous chapter's pending push if switching chapters
  if (pendingPush && progressKey(pendingPush.mangaSlug, pendingPush.chapterSlug) !== key) {
    const { userId: uid, mangaSlug: ms, chapterSlug: cs, update: u } = pendingPush;
    pendingPush = null;
    pushSingleProgress(uid, ms, cs, u).catch(() => {});
  }
  pendingPush = { userId, mangaSlug, chapterSlug, update };
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (!pendingPush) return;
    const { userId: uid, mangaSlug: ms, chapterSlug: cs, update: u } = pendingPush;
    pendingPush = null;
    pushSingleProgress(uid, ms, cs, u).catch(() => {});
  }, 5000);
}

// Pending library actions that haven't been confirmed by the server yet
const pendingLibraryAdds = new Set<string>();

// Pending favorite actions that haven't been confirmed by the server yet
const pendingFavoriteActions = new Map<string, 'favorite' | 'unfavorite'>();

// localStorage persistence for favoriteSlugs
const FAVORITE_SLUGS_KEY = 'manga-favorite-slugs';

function loadFavoriteSlugs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FAVORITE_SLUGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { /* ignore */ return []; }
}

function saveFavoriteSlugs(slugs: string[]) {
  try { localStorage.setItem(FAVORITE_SLUGS_KEY, JSON.stringify(slugs)); } catch { /* ignore */ }
}

// localStorage persistence for seenChapterCounts
const SEEN_COUNTS_KEY = 'manga-seen-counts';

function loadSeenCounts(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SEEN_COUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { /* ignore */ return {}; }
}

function saveSeenCounts(counts: Record<string, number>) {
  try { localStorage.setItem(SEEN_COUNTS_KEY, JSON.stringify(counts)); } catch { /* ignore */ }
}

// localStorage persistence for progress cache
const PROGRESS_CACHE_KEY = 'manga-progress-cache';

function loadProgressCache(): Record<string, ReadingProgress> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROGRESS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { /* ignore */ return {}; }
}

function saveProgressCache(progress: Record<string, ReadingProgress>) {
  try { localStorage.setItem(PROGRESS_CACHE_KEY, JSON.stringify(progress)); } catch { /* ignore */ }
}

// localStorage persistence for followedSlugs
const FOLLOWED_SLUGS_KEY = 'manga-followed-slugs';

function loadFollowedSlugs(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(FOLLOWED_SLUGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { /* ignore */ return []; }
}

function saveFollowedSlugs(slugs: string[]) {
  try { localStorage.setItem(FOLLOWED_SLUGS_KEY, JSON.stringify(slugs)); } catch { /* ignore */ }
}

// Only hydrate settings (language, etc.) on initial boot, not on every tab switch
let initialHydrationDone = false;

// Periodic sync polling (module-level, same pattern as pushTimer)
let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPollingSyncing = false;
const POLL_INTERVAL_MS = 30_000;

/** Reset module-level pending state (for tests) */
export function resetPendingState(): void {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  pendingPush = null;
  pendingLibraryAdds.clear();
  pendingFavoriteActions.clear();
  initialHydrationDone = false;
  stopSyncPolling();
}

/** Start periodic sync check polling. Polls the lightweight sync-check endpoint
 *  every 30s and triggers a full hydration only when the server has newer data. */
export function startSyncPolling(userId: string): void {
  stopSyncPolling();
  pollTimer = setInterval(() => {
    if (isPollingSyncing) return;
    isPollingSyncing = true;
    const lastSynced = useProgressStore.getState().lastSyncedAt ?? 0;
    fetchSyncCheck(userId)
      .then((lastUseAt) => {
        if (lastUseAt && lastUseAt > lastSynced) {
          return useProgressStore.getState().hydrateFromServer(userId);
        }
      })
      .catch(() => {})
      .finally(() => { isPollingSyncing = false; });
  }, POLL_INTERVAL_MS);
}

/** Stop periodic sync polling. */
export function stopSyncPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  isPollingSyncing = false;
}

export function flushPendingPush(): void {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  if (pendingPush) {
    const { userId, mangaSlug, chapterSlug, update } = pendingPush;
    pendingPush = null;
    fetch(`/api/progress/${userId}/${mangaSlug}/${chapterSlug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
      keepalive: true,
    }).catch(() => {});
  }
  // Flush pending library additions
  if (pendingLibraryAdds.size > 0) {
    const userId = useUserStore.getState().userId;
    for (const slug of pendingLibraryAdds) {
      fetch(`/api/user/${userId}/library`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', mangaSlug: slug }),
        keepalive: true,
      }).catch(() => {});
    }
    // Don't clear pendingLibraryAdds here — keepalive fetches are fire-and-forget.
    // hydrateFromServer will re-detect and re-push any that didn't make it.
  }
  // Flush pending favorite actions
  if (pendingFavoriteActions.size > 0) {
    const userId = useUserStore.getState().userId;
    for (const [slug, action] of pendingFavoriteActions) {
      fetch(`/api/user/${userId}/library`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, mangaSlug: slug }),
        keepalive: true,
      }).catch(() => {});
    }
  }
}

export const useProgressStore = create<ProgressState>()((set, get) => ({
  progress: loadProgressCache(),
  followedSlugs: loadFollowedSlugs(),
  favoriteSlugs: loadFavoriteSlugs(),
  isHydrated: false,
  lastSyncedAt: null,
  seenChapterCounts: loadSeenCounts(),

  updateProgress: (mangaSlug, chapterSlug, update) => {
    const wasFollowed = get().followedSlugs.includes(mangaSlug);

    set((state) => {
      const key = progressKey(mangaSlug, chapterSlug);
      const defaults: ReadingProgress = {
        chapterSlug,
        mangaSlug,
        currentPage: 0,
        totalPages: 0,
        scrollPercent: 0,
        lastReadAt: Date.now(),
        completed: false,
      };
      const merged = {
        ...defaults,
        ...state.progress[key],
        ...update,
        mangaSlug,
        chapterSlug,
        lastReadAt: Date.now(),
      };

      // Auto-follow manga if not already followed
      const followed = state.followedSlugs.includes(mangaSlug)
        ? state.followedSlugs
        : [...state.followedSlugs, mangaSlug];

      return {
        progress: { ...state.progress, [key]: merged },
        followedSlugs: followed,
      };
    });

    saveProgressCache(get().progress);
    if (!wasFollowed) saveFollowedSlugs(get().followedSlugs);

    const userId = useUserStore.getState().userId;
    if (userId) {
      // Auto-follow on server if newly followed
      if (!wasFollowed) {
        pendingLibraryAdds.add(mangaSlug);
        pushLibraryAction(userId, 'add', mangaSlug)
          .then(() => { pendingLibraryAdds.delete(mangaSlug); })
          .catch(() => {});
      }

      const key = progressKey(mangaSlug, chapterSlug);
      const current = get().progress[key];
      if (current) {
        debouncedServerPush(userId, mangaSlug, chapterSlug, current);
      }
    }
  },

  markCompleted: (mangaSlug, chapterSlug) => {
    set((state) => {
      const key = progressKey(mangaSlug, chapterSlug);
      const existing = state.progress[key];
      return {
        progress: {
          ...state.progress,
          [key]: {
            chapterSlug,
            mangaSlug,
            currentPage: existing?.currentPage ?? 0,
            totalPages: existing?.totalPages ?? 0,
            scrollPercent: 1,
            lastReadAt: Date.now(),
            completed: true,
          },
        },
      };
    });

    saveProgressCache(get().progress);

    const userId = useUserStore.getState().userId;
    if (userId) {
      const key = progressKey(mangaSlug, chapterSlug);
      const current = get().progress[key];
      if (current) {
        debouncedServerPush(userId, mangaSlug, chapterSlug, current);
      }
    }
  },

  markBatchCompleted: (mangaSlug, chapterSlugs) => {
    const wasFollowed = get().followedSlugs.includes(mangaSlug);
    const now = Date.now();
    set((state) => {
      const newProgress = { ...state.progress };
      for (const cs of chapterSlugs) {
        const key = progressKey(mangaSlug, cs);
        const existing = newProgress[key];
        newProgress[key] = {
          chapterSlug: cs,
          mangaSlug,
          currentPage: existing?.currentPage ?? 0,
          totalPages: existing?.totalPages ?? 0,
          scrollPercent: 1,
          lastReadAt: now,
          completed: true,
        };
      }
      const followed = state.followedSlugs.includes(mangaSlug)
        ? state.followedSlugs
        : [...state.followedSlugs, mangaSlug];
      return { progress: newProgress, followedSlugs: followed };
    });

    saveProgressCache(get().progress);
    if (!wasFollowed) saveFollowedSlugs(get().followedSlugs);

    const userId = useUserStore.getState().userId;
    if (userId) {
      if (!wasFollowed) {
        pendingLibraryAdds.add(mangaSlug);
        pushLibraryAction(userId, 'add', mangaSlug)
          .then(() => { pendingLibraryAdds.delete(mangaSlug); })
          .catch(() => {});
      }
      pushBatchProgress(userId, mangaSlug, chapterSlugs).catch(() => {});
    }
  },

  getProgress: (mangaSlug, chapterSlug) =>
    get().progress[progressKey(mangaSlug, chapterSlug)],

  getLastRead: () => {
    const all = Object.values(get().progress);
    if (all.length === 0) return undefined;
    return all.reduce((latest, p) =>
      p.lastReadAt > latest.lastReadAt ? p : latest
    );
  },

  getLastReadForManga: (mangaSlug) => {
    const all = Object.values(get().progress).filter(
      (p) => p.mangaSlug === mangaSlug
    );
    if (all.length === 0) return undefined;
    return all.reduce((latest, p) =>
      p.lastReadAt > latest.lastReadAt ? p : latest
    );
  },

  getMangaProgress: (mangaSlug) => {
    const result: Record<string, ReadingProgress> = {};
    for (const [key, value] of Object.entries(get().progress)) {
      if (value.mangaSlug === mangaSlug) {
        result[key] = value;
      }
    }
    return result;
  },

  setSeenChapterCount: (mangaSlug, count) =>
    set((state) => {
      const updated = { ...state.seenChapterCounts, [mangaSlug]: count };
      saveSeenCounts(updated);
      return { seenChapterCounts: updated };
    }),

  toggleFavorite: (mangaSlug) => {
    let action: 'favorite' | 'unfavorite';
    set((state) => {
      const isFav = state.favoriteSlugs.includes(mangaSlug);
      action = isFav ? 'unfavorite' : 'favorite';
      const newFavs = isFav
        ? state.favoriteSlugs.filter(s => s !== mangaSlug)
        : [...state.favoriteSlugs, mangaSlug];
      saveFavoriteSlugs(newFavs);
      return { favoriteSlugs: newFavs };
    });
    const userId = useUserStore.getState().userId;
    if (userId) {
      pendingFavoriteActions.set(mangaSlug, action!);
      pushLibraryAction(userId, action!, mangaSlug)
        .then(() => { pendingFavoriteActions.delete(mangaSlug); })
        .catch(() => {});
    }
  },

  followManga: (mangaSlug) => {
    set((state) => {
      if (state.followedSlugs.includes(mangaSlug)) return state;
      return { followedSlugs: [...state.followedSlugs, mangaSlug] };
    });
    saveFollowedSlugs(get().followedSlugs);
    const userId = useUserStore.getState().userId;
    if (userId) {
      pendingLibraryAdds.add(mangaSlug);
      pushLibraryAction(userId, 'add', mangaSlug)
        .then(() => { pendingLibraryAdds.delete(mangaSlug); })
        .catch(() => {});
    }
  },

  unfollowManga: (mangaSlug) => {
    pendingLibraryAdds.delete(mangaSlug);
    pendingFavoriteActions.delete(mangaSlug);
    set((state) => {
      const newProgress = { ...state.progress };
      for (const key of Object.keys(newProgress)) {
        if (key.startsWith(mangaSlug + '/')) {
          delete newProgress[key];
        }
      }
      const newSeen = { ...state.seenChapterCounts };
      delete newSeen[mangaSlug];
      saveSeenCounts(newSeen);
      const newFavs = state.favoriteSlugs.filter(s => s !== mangaSlug);
      saveFavoriteSlugs(newFavs);
      return {
        followedSlugs: state.followedSlugs.filter((s) => s !== mangaSlug),
        favoriteSlugs: newFavs,
        progress: newProgress,
        seenChapterCounts: newSeen,
      };
    });
    saveProgressCache(get().progress);
    saveFollowedSlugs(get().followedSlugs);
    const userId = useUserStore.getState().userId;
    if (userId) {
      pushLibraryAction(userId, 'remove', mangaSlug).catch(() => {});
    }
  },

  hydrateFromServer: async (userId) => {
    try {
      const data = await fetchUserState(userId);

      // Merge server progress with local (last-write-wins per chapter)
      const local = get().progress;
      const merged: Record<string, ReadingProgress> = { ...data.progress };
      for (const [key, entry] of Object.entries(local)) {
        const server = merged[key];
        if (!server || entry.lastReadAt > server.lastReadAt) {
          merged[key] = entry;
        }
      }

      // Preserve local follows that haven't been confirmed by the server
      const serverSet = new Set(data.library);
      const localPending = [...pendingLibraryAdds].filter(s => !serverSet.has(s));
      const mergedLibrary = localPending.length > 0
        ? [...data.library, ...localPending]
        : data.library;

      // Re-push pending follows to server
      for (const slug of localPending) {
        pushLibraryAction(userId, 'add', slug)
          .then(() => { pendingLibraryAdds.delete(slug); })
          .catch(() => {});
      }

      // Re-push local progress entries that won the merge over server
      for (const [key, entry] of Object.entries(local)) {
        const server = data.progress[key];
        if (!server || entry.lastReadAt > server.lastReadAt) {
          const [ms, cs] = key.split('/');
          pushSingleProgress(userId, ms, cs, entry).catch(() => {});
        }
      }

      // Merge favorites: server is source of truth, overlay pending local actions
      const mergedFavSet = new Set(data.favorites ?? []);
      for (const [slug, action] of pendingFavoriteActions) {
        if (action === 'favorite') mergedFavSet.add(slug);
        else mergedFavSet.delete(slug);
      }
      // Favorites must be a subset of library
      const librarySet = new Set(mergedLibrary);
      const mergedFavorites = [...mergedFavSet].filter(s => librarySet.has(s));
      saveFavoriteSlugs(mergedFavorites);

      // Prune pending favorite actions already reflected on server, re-push the rest
      const serverFavSet = new Set(data.favorites ?? []);
      for (const [slug, action] of pendingFavoriteActions) {
        const serverHas = serverFavSet.has(slug);
        if ((action === 'favorite' && serverHas) || (action === 'unfavorite' && !serverHas)) {
          pendingFavoriteActions.delete(slug);
        } else {
          pushLibraryAction(userId, action, slug)
            .then(() => { pendingFavoriteActions.delete(slug); })
            .catch(() => {});
        }
      }

      set({
        progress: merged,
        followedSlugs: mergedLibrary,
        favoriteSlugs: mergedFavorites,
        isHydrated: true,
        lastSyncedAt: Date.now(),
      });

      saveProgressCache(merged);
      saveFollowedSlugs(mergedLibrary);

      // Only hydrate settings on initial boot to avoid changing language mid-session
      if (!initialHydrationDone) {
        useSettingsStore.getState().hydrateSettings(data.settings);
        initialHydrationDone = true;
      }
    } catch {
      // Always mark as hydrated so the UI isn't stuck on spinner
      set({ isHydrated: true });
    }
  },

  syncFromServer: async (userId) => {
    const serverProgress = await fetchProgressFromServer(userId);
    set({ progress: serverProgress, lastSyncedAt: Date.now() });
    saveProgressCache(serverProgress);
  },

  syncToServer: async (userId) => {
    const { progress } = get();
    await syncProgressToServer(userId, progress);
    set({ lastSyncedAt: Date.now() });
  },
}));
