import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useProgressStore, flushPendingPush, resetPendingState, startSyncPolling, stopSyncPolling } from '../progressStore';

const MANGA = 'one_piece';

// Provide localStorage mock for non-JSDOM environments
const storage = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, val: string) => { storage.set(key, val); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => { storage.clear(); },
      get length() { return storage.size; },
      key: (i: number) => [...storage.keys()][i] ?? null,
    },
    writable: true,
  });
}

describe('progressStore', () => {
  beforeEach(() => {
    resetPendingState();
    localStorage.clear();
    useProgressStore.setState({ progress: {}, seenChapterCounts: {}, followedSlugs: [], favoriteSlugs: [], isHydrated: false, lastSyncedAt: null });
  });

  afterEach(() => {
    stopSyncPolling();
    vi.restoreAllMocks();
  });

  it('starts with empty progress', () => {
    const state = useProgressStore.getState();
    expect(state.progress).toEqual({});
  });

  describe('updateProgress', () => {
    it('creates new progress entry with defaults', () => {
      const { updateProgress } = useProgressStore.getState();
      updateProgress(MANGA, 'chapter-1', { currentPage: 5, totalPages: 20 });

      const entry = useProgressStore.getState().progress['one_piece/chapter-1'];
      expect(entry).toBeDefined();
      expect(entry.chapterSlug).toBe('chapter-1');
      expect(entry.mangaSlug).toBe(MANGA);
      expect(entry.currentPage).toBe(5);
      expect(entry.totalPages).toBe(20);
      expect(entry.scrollPercent).toBe(0);
      expect(entry.completed).toBe(false);
      expect(entry.lastReadAt).toBeGreaterThan(0);
    });

    it('merges with existing progress', () => {
      const { updateProgress } = useProgressStore.getState();
      updateProgress(MANGA, 'chapter-1', { currentPage: 5, totalPages: 20 });
      updateProgress(MANGA, 'chapter-1', { scrollPercent: 0.5 });

      const entry = useProgressStore.getState().progress['one_piece/chapter-1'];
      expect(entry.currentPage).toBe(5);
      expect(entry.scrollPercent).toBe(0.5);
    });

    it('updates lastReadAt on each call', () => {
      const { updateProgress } = useProgressStore.getState();
      updateProgress(MANGA, 'chapter-1', { currentPage: 0 });
      const first = useProgressStore.getState().progress['one_piece/chapter-1'].lastReadAt;

      updateProgress(MANGA, 'chapter-1', { currentPage: 1 });
      const second = useProgressStore.getState().progress['one_piece/chapter-1'].lastReadAt;
      expect(second).toBeGreaterThanOrEqual(first);
    });
  });

  describe('markCompleted', () => {
    it('marks chapter as completed with scrollPercent 1', () => {
      const { updateProgress, markCompleted } = useProgressStore.getState();
      updateProgress(MANGA, 'chapter-1', { currentPage: 5, totalPages: 20 });
      markCompleted(MANGA, 'chapter-1');

      const entry = useProgressStore.getState().progress['one_piece/chapter-1'];
      expect(entry.completed).toBe(true);
      expect(entry.scrollPercent).toBe(1);
    });

    it('works even without prior progress', () => {
      const { markCompleted } = useProgressStore.getState();
      markCompleted(MANGA, 'chapter-new');

      const entry = useProgressStore.getState().progress['one_piece/chapter-new'];
      expect(entry.completed).toBe(true);
      expect(entry.scrollPercent).toBe(1);
      expect(entry.currentPage).toBe(0);
    });
  });

  describe('getProgress', () => {
    it('returns undefined for unknown slug', () => {
      const { getProgress } = useProgressStore.getState();
      expect(getProgress(MANGA, 'nonexistent')).toBeUndefined();
    });

    it('returns progress for known slug', () => {
      const { updateProgress, getProgress } = useProgressStore.getState();
      updateProgress(MANGA, 'chapter-1', { currentPage: 3 });
      expect(getProgress(MANGA, 'chapter-1')).toBeDefined();
      expect(getProgress(MANGA, 'chapter-1')!.currentPage).toBe(3);
    });
  });

  describe('getLastRead', () => {
    it('returns undefined when no progress exists', () => {
      const { getLastRead } = useProgressStore.getState();
      expect(getLastRead()).toBeUndefined();
    });

    it('returns the most recently read chapter', () => {
      useProgressStore.setState({
        progress: {
          'one_piece/chapter-1': {
            chapterSlug: 'chapter-1', mangaSlug: MANGA, currentPage: 5, totalPages: 20,
            scrollPercent: 0, lastReadAt: 1000, completed: false,
          },
          'one_piece/chapter-2': {
            chapterSlug: 'chapter-2', mangaSlug: MANGA, currentPage: 10, totalPages: 20,
            scrollPercent: 0, lastReadAt: 2000, completed: false,
          },
        },
      });

      const last = useProgressStore.getState().getLastRead();
      expect(last).toBeDefined();
      expect(last!.chapterSlug).toBe('chapter-2');
    });
  });

  describe('getMangaProgress', () => {
    it('returns only progress entries for specified manga', () => {
      useProgressStore.setState({
        progress: {
          'one_piece/chapter-1': {
            chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 5, totalPages: 20,
            scrollPercent: 0, lastReadAt: 1000, completed: false,
          },
          'naruto/chapter-1': {
            chapterSlug: 'chapter-1', mangaSlug: 'naruto', currentPage: 2, totalPages: 15,
            scrollPercent: 0, lastReadAt: 2000, completed: false,
          },
        },
      });

      const result = useProgressStore.getState().getMangaProgress('one_piece');
      expect(Object.keys(result)).toHaveLength(1);
      expect(result['one_piece/chapter-1']).toBeDefined();
    });

    it('returns empty object for unknown manga', () => {
      const result = useProgressStore.getState().getMangaProgress('unknown');
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('getLastReadForManga', () => {
    it('returns last read for specific manga', () => {
      useProgressStore.setState({
        progress: {
          'one_piece/chapter-1': {
            chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 5, totalPages: 20,
            scrollPercent: 0, lastReadAt: 3000, completed: false,
          },
          'naruto/chapter-1': {
            chapterSlug: 'chapter-1', mangaSlug: 'naruto', currentPage: 2, totalPages: 15,
            scrollPercent: 0, lastReadAt: 4000, completed: false,
          },
        },
      });

      const last = useProgressStore.getState().getLastReadForManga('one_piece');
      expect(last).toBeDefined();
      expect(last!.mangaSlug).toBe('one_piece');
    });

    it('returns undefined for manga with no progress', () => {
      const { getLastReadForManga } = useProgressStore.getState();
      expect(getLastReadForManga('unknown_manga')).toBeUndefined();
    });
  });

  describe('flushPendingPush', () => {
    it('is a function', () => {
      expect(typeof flushPendingPush).toBe('function');
    });

    it('does not throw when no pending push exists', () => {
      expect(() => flushPendingPush()).not.toThrow();
    });
  });

  describe('syncFromServer', () => {
    it('merges server progress with local (server wins on newer lastReadAt)', async () => {
      useProgressStore.setState({
        progress: {
          'one_piece/chapter-1': {
            chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 5, totalPages: 20,
            scrollPercent: 0.3, lastReadAt: 1000, completed: false,
          },
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            'one_piece/chapter-1': {
              chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 15, totalPages: 20,
              scrollPercent: 0.8, lastReadAt: 2000, completed: false,
            },
          },
        }),
      } as Response);

      await useProgressStore.getState().syncFromServer('test-uuid');
      const entry = useProgressStore.getState().progress['one_piece/chapter-1'];
      expect(entry.currentPage).toBe(15);
      expect(entry.scrollPercent).toBe(0.8);
      vi.restoreAllMocks();
    });

    it('replaces local entry with server data (server is truth)', async () => {
      useProgressStore.setState({
        progress: {
          'one_piece/chapter-1': {
            chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 18, totalPages: 20,
            scrollPercent: 0.9, lastReadAt: 3000, completed: false,
          },
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            'one_piece/chapter-1': {
              chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 5, totalPages: 20,
              scrollPercent: 0.3, lastReadAt: 1000, completed: false,
            },
          },
        }),
      } as Response);

      await useProgressStore.getState().syncFromServer('test-uuid');
      const entry = useProgressStore.getState().progress['one_piece/chapter-1'];
      expect(entry.currentPage).toBe(5);
      vi.restoreAllMocks();
    });

    it('sets lastSyncedAt after sync', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ progress: {} }),
      } as Response);

      await useProgressStore.getState().syncFromServer('test-uuid');
      expect(useProgressStore.getState().lastSyncedAt).toBeGreaterThan(0);
      vi.restoreAllMocks();
    });
  });

  describe('syncToServer', () => {
    it('sends local progress to server via PUT', async () => {
      useProgressStore.setState({
        progress: {
          'one_piece/chapter-1': {
            chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 5, totalPages: 20,
            scrollPercent: 0.3, lastReadAt: 1000, completed: false,
          },
        },
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      await useProgressStore.getState().syncToServer('test-uuid');
      expect(fetchSpy).toHaveBeenCalledWith('/api/progress/test-uuid', expect.objectContaining({
        method: 'PUT',
      }));
      expect(useProgressStore.getState().lastSyncedAt).toBeGreaterThan(0);
      vi.restoreAllMocks();
    });
  });

  describe('followedSlugs', () => {
    it('starts with empty followedSlugs', () => {
      expect(useProgressStore.getState().followedSlugs).toEqual([]);
    });

    it('auto-follows manga on updateProgress', () => {
      useProgressStore.getState().updateProgress(MANGA, 'chapter-1', { currentPage: 1 });
      expect(useProgressStore.getState().followedSlugs).toContain(MANGA);
    });

    it('does not duplicate followed manga on repeated updateProgress', () => {
      useProgressStore.getState().updateProgress(MANGA, 'chapter-1', { currentPage: 1 });
      useProgressStore.getState().updateProgress(MANGA, 'chapter-2', { currentPage: 1 });
      const count = useProgressStore.getState().followedSlugs.filter(s => s === MANGA).length;
      expect(count).toBe(1);
    });

    it('followManga adds to followedSlugs', () => {
      useProgressStore.getState().followManga('naruto');
      expect(useProgressStore.getState().followedSlugs).toContain('naruto');
    });

    it('followManga is idempotent', () => {
      useProgressStore.getState().followManga('naruto');
      useProgressStore.getState().followManga('naruto');
      const count = useProgressStore.getState().followedSlugs.filter(s => s === 'naruto').length;
      expect(count).toBe(1);
    });

    it('unfollowManga removes from followedSlugs', () => {
      useProgressStore.getState().followManga('naruto');
      useProgressStore.getState().unfollowManga('naruto');
      expect(useProgressStore.getState().followedSlugs).not.toContain('naruto');
    });
  });

  describe('isHydrated', () => {
    it('starts as false', () => {
      expect(useProgressStore.getState().isHydrated).toBe(false);
    });
  });

  describe('localStorage persistence', () => {
    it('saves progress to localStorage on updateProgress', () => {
      useProgressStore.getState().updateProgress('one_piece', 'ch-1', { currentPage: 5, totalPages: 20 });

      const cached = JSON.parse(localStorage.getItem('manga-progress-cache') ?? '{}');
      expect(cached['one_piece/ch-1']).toBeDefined();
      expect(cached['one_piece/ch-1'].currentPage).toBe(5);
    });

    it('saves followedSlugs to localStorage on first follow', () => {
      useProgressStore.getState().updateProgress('naruto', 'ch-1', { currentPage: 1 });

      const cached = JSON.parse(localStorage.getItem('manga-followed-slugs') ?? '[]');
      expect(cached).toContain('naruto');
    });

    it('saves progress to localStorage on markCompleted', () => {
      useProgressStore.getState().markCompleted('one_piece', 'ch-1');

      const cached = JSON.parse(localStorage.getItem('manga-progress-cache') ?? '{}');
      expect(cached['one_piece/ch-1']).toBeDefined();
      expect(cached['one_piece/ch-1'].completed).toBe(true);
    });

    it('saves progress to localStorage on markBatchCompleted', () => {
      useProgressStore.getState().markBatchCompleted('one_piece', ['ch-1', 'ch-2', 'ch-3']);

      const cached = JSON.parse(localStorage.getItem('manga-progress-cache') ?? '{}');
      expect(Object.keys(cached)).toHaveLength(3);
      expect(cached['one_piece/ch-1'].completed).toBe(true);
      expect(cached['one_piece/ch-3'].completed).toBe(true);
    });

    it('removes progress from localStorage on unfollowManga', () => {
      useProgressStore.getState().updateProgress('naruto', 'ch-1', { currentPage: 5 });
      expect(JSON.parse(localStorage.getItem('manga-progress-cache') ?? '{}')['naruto/ch-1']).toBeDefined();

      useProgressStore.getState().unfollowManga('naruto');
      const cached = JSON.parse(localStorage.getItem('manga-progress-cache') ?? '{}');
      expect(cached['naruto/ch-1']).toBeUndefined();
    });

    it('saves followedSlugs to localStorage on followManga', () => {
      useProgressStore.getState().followManga('bleach');

      const cached = JSON.parse(localStorage.getItem('manga-followed-slugs') ?? '[]');
      expect(cached).toContain('bleach');
    });

    it('updates followedSlugs in localStorage on unfollowManga', () => {
      useProgressStore.getState().followManga('bleach');
      useProgressStore.getState().unfollowManga('bleach');

      const cached = JSON.parse(localStorage.getItem('manga-followed-slugs') ?? '[]');
      expect(cached).not.toContain('bleach');
    });

    it('saves progress cache after hydrateFromServer', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            'one_piece/ch-1': {
              chapterSlug: 'ch-1', mangaSlug: 'one_piece', currentPage: 10, totalPages: 20,
              scrollPercent: 0.5, lastReadAt: 5000, completed: false,
            },
          },
          library: ['one_piece'],
          favorites: [],
          settings: { readingMode: 'longstrip', prefetchCount: 3, autoNextChapter: true, language: 'fr' },
        }),
      } as Response);

      await useProgressStore.getState().hydrateFromServer('test-uuid');

      const cachedProgress = JSON.parse(localStorage.getItem('manga-progress-cache') ?? '{}');
      expect(cachedProgress['one_piece/ch-1']).toBeDefined();
      expect(cachedProgress['one_piece/ch-1'].currentPage).toBe(10);

      const cachedSlugs = JSON.parse(localStorage.getItem('manga-followed-slugs') ?? '[]');
      expect(cachedSlugs).toContain('one_piece');
    });

    it('saves progress cache after syncFromServer', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            'naruto/ch-5': {
              chapterSlug: 'ch-5', mangaSlug: 'naruto', currentPage: 3, totalPages: 18,
              scrollPercent: 0.2, lastReadAt: 3000, completed: false,
            },
          },
        }),
      } as Response);

      await useProgressStore.getState().syncFromServer('test-uuid');

      const cached = JSON.parse(localStorage.getItem('manga-progress-cache') ?? '{}');
      expect(cached['naruto/ch-5']).toBeDefined();
    });
  });

  describe('sync polling', () => {
    it('startSyncPolling and stopSyncPolling are functions', () => {
      expect(typeof startSyncPolling).toBe('function');
      expect(typeof stopSyncPolling).toBe('function');
    });

    it('stopSyncPolling does not throw when not polling', () => {
      expect(() => stopSyncPolling()).not.toThrow();
    });

    it('startSyncPolling starts interval that calls fetchSyncCheck', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ lastUseAt: null }),
      } as Response);

      startSyncPolling('test-uuid');

      // No call before interval fires
      expect(fetchSpy).not.toHaveBeenCalled();

      // Advance past one poll interval (30s)
      await vi.advanceTimersByTimeAsync(30_000);

      expect(fetchSpy).toHaveBeenCalledWith('/api/user/test-uuid/sync-check');

      stopSyncPolling();
      vi.useRealTimers();
    });

    it('polling does NOT trigger hydration when server lastUseAt <= lastSyncedAt', async () => {
      vi.useFakeTimers();
      useProgressStore.setState({ lastSyncedAt: 5000 });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ lastUseAt: 4000 }),
      } as Response);

      startSyncPolling('test-uuid');
      await vi.advanceTimersByTimeAsync(30_000);

      // Only the sync-check call, no hydration (fetchUserState) call
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('/api/user/test-uuid/sync-check');

      stopSyncPolling();
      vi.useRealTimers();
    });

    it('polling triggers hydration when server lastUseAt > lastSyncedAt', async () => {
      vi.useFakeTimers();
      useProgressStore.setState({ lastSyncedAt: 1000 });

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        // First call: sync-check
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ lastUseAt: 5000 }),
        } as Response)
        // Second call: fetchUserState (hydration)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            progress: {},
            library: [],
            favorites: [],
            settings: { readingMode: 'longstrip', prefetchCount: 3, autoNextChapter: true, language: 'fr' },
          }),
        } as Response);

      startSyncPolling('test-uuid');
      await vi.advanceTimersByTimeAsync(30_000);

      // sync-check + fetchUserState
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(1, '/api/user/test-uuid/sync-check');
      expect(fetchSpy).toHaveBeenNthCalledWith(2, '/api/user/test-uuid');

      stopSyncPolling();
      vi.useRealTimers();
    });

    it('stopSyncPolling stops the interval', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ lastUseAt: null }),
      } as Response);

      startSyncPolling('test-uuid');
      stopSyncPolling();

      await vi.advanceTimersByTimeAsync(60_000);

      // No calls since polling was stopped
      expect(fetchSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('startSyncPolling replaces previous polling (no duplicate intervals)', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ lastUseAt: null }),
      } as Response);

      startSyncPolling('user-A');
      startSyncPolling('user-B');

      await vi.advanceTimersByTimeAsync(30_000);

      // Only one call (user-B), not two
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith('/api/user/user-B/sync-check');

      stopSyncPolling();
      vi.useRealTimers();
    });

    it('resetPendingState stops polling', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ lastUseAt: null }),
      } as Response);

      startSyncPolling('test-uuid');
      resetPendingState();

      await vi.advanceTimersByTimeAsync(60_000);

      expect(fetchSpy).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('hydrateFromServer', () => {
    it('replaces progress, followedSlugs, sets isHydrated', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          progress: {
            'naruto/chapter-1': {
              chapterSlug: 'chapter-1', mangaSlug: 'naruto', currentPage: 10, totalPages: 20,
              scrollPercent: 0.5, lastReadAt: 5000, completed: false,
            },
          },
          library: ['naruto', 'bleach'],
          settings: { readingMode: 'paged', prefetchCount: 5, autoNextChapter: false, language: 'en' },
        }),
      } as Response);

      await useProgressStore.getState().hydrateFromServer('test-uuid');
      const state = useProgressStore.getState();
      expect(state.isHydrated).toBe(true);
      expect(state.followedSlugs).toEqual(['naruto', 'bleach']);
      expect(state.progress['naruto/chapter-1'].currentPage).toBe(10);
      expect(state.lastSyncedAt).toBeGreaterThan(0);
      vi.restoreAllMocks();
    });
  });

  describe('seenChapterCounts', () => {
    it('starts with empty seenChapterCounts', () => {
      expect(useProgressStore.getState().seenChapterCounts).toEqual({});
    });

    it('sets seen chapter count for a manga', () => {
      useProgressStore.getState().setSeenChapterCount('one_piece', 1130);
      expect(useProgressStore.getState().seenChapterCounts['one_piece']).toBe(1130);
    });

    it('updates existing seen chapter count', () => {
      useProgressStore.getState().setSeenChapterCount('one_piece', 1130);
      useProgressStore.getState().setSeenChapterCount('one_piece', 1131);
      expect(useProgressStore.getState().seenChapterCounts['one_piece']).toBe(1131);
    });

    it('tracks multiple mangas independently', () => {
      useProgressStore.getState().setSeenChapterCount('one_piece', 1130);
      useProgressStore.getState().setSeenChapterCount('naruto', 700);
      const counts = useProgressStore.getState().seenChapterCounts;
      expect(counts['one_piece']).toBe(1130);
      expect(counts['naruto']).toBe(700);
    });
  });
});
