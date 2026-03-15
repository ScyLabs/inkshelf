import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLibraryStore } from '../libraryStore';

vi.mock('../../services/api', () => ({
  fetchMangaList: vi.fn(),
  fetchLatestMangas: vi.fn(),
  searchMangas: vi.fn(),
}));

import { fetchMangaList, fetchLatestMangas, searchMangas } from '../../services/api';
const mockFetch = vi.mocked(fetchMangaList);
const mockFetchLatest = vi.mocked(fetchLatestMangas);
const mockSearch = vi.mocked(searchMangas);

describe('libraryStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useLibraryStore.setState({
      mangas: [], loading: false, error: null, search: '', searchResults: [], searchLoading: false, loadedLang: null,
      latestUpdates: [], latestNew: [], loadingLatestUpdates: false, loadingLatestNew: false, sortMode: 'default',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with empty state', () => {
    const state = useLibraryStore.getState();
    expect(state.mangas).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.search).toBe('');
    expect(state.loadedLang).toBeNull();
  });

  describe('load', () => {
    it('fetches manga list for given language', async () => {
      const mockData = [
        { slug: 'one_piece', title: 'One Piece', coverUrl: '/cover.jpg', source: 'scanvf' as const, language: 'fr' as const },
      ];
      mockFetch.mockResolvedValue(mockData);

      await useLibraryStore.getState().load('fr');

      const state = useLibraryStore.getState();
      expect(state.mangas).toEqual(mockData);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.loadedLang).toBe('fr');
      expect(mockFetch).toHaveBeenCalledWith('fr');
    });

    it('skips fetch if mangas already loaded for same language', async () => {
      useLibraryStore.setState({
        mangas: [{ slug: 'test', title: 'Test', coverUrl: '', source: 'scanvf', language: 'fr' }],
        loadedLang: 'fr',
      });

      await useLibraryStore.getState().load('fr');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('reloads when language changes', async () => {
      useLibraryStore.setState({
        mangas: [{ slug: 'test', title: 'Test', coverUrl: '', source: 'scanvf', language: 'fr' }],
        loadedLang: 'fr',
      });
      mockFetch.mockResolvedValue([]);

      await useLibraryStore.getState().load('en');

      expect(mockFetch).toHaveBeenCalledWith('en');
      expect(useLibraryStore.getState().loadedLang).toBe('en');
    });

    it('allows loading different language while current is loading', async () => {
      let resolveFr: (v: never[]) => void;
      const frPromise = new Promise<never[]>((r) => { resolveFr = r; });
      const enData = [{ slug: 'test-en', title: 'Test EN', coverUrl: '', source: 'mangapill' as const, language: 'en' as const }];

      mockFetch.mockImplementation(async (lang) => {
        if (lang === 'fr') return frPromise;
        return enData;
      });

      // Start FR load (will be pending)
      const frLoad = useLibraryStore.getState().load('fr');
      // Start EN load while FR is still loading — should NOT be blocked
      const enLoad = useLibraryStore.getState().load('en');

      await enLoad;
      expect(useLibraryStore.getState().loadedLang).toBe('en');
      expect(useLibraryStore.getState().mangas).toEqual(enData);

      // Resolve FR — should be ignored since EN was requested after
      resolveFr!([] as never[]);
      await frLoad;
    });

    it('sets error on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await useLibraryStore.getState().load('fr');

      const state = useLibraryStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.loading).toBe(false);
    });
  });

  describe('setSearch', () => {
    it('updates search string', () => {
      useLibraryStore.getState().setSearch('naruto');
      expect(useLibraryStore.getState().search).toBe('naruto');
    });
  });

  describe('loadLatest', () => {
    it('fetches latest updates and stores them', async () => {
      const mockData = [
        { slug: 'mgk-test', title: 'Test', coverUrl: '', source: 'mgeko' as const, language: 'en' as const },
      ];
      mockFetchLatest.mockResolvedValue(mockData);

      await useLibraryStore.getState().loadLatest('updates', 'en');

      const state = useLibraryStore.getState();
      expect(state.latestUpdates).toEqual(mockData);
      expect(state.loadingLatestUpdates).toBe(false);
      expect(mockFetchLatest).toHaveBeenCalledWith('en', 'updates');
    });

    it('fetches latest new and stores them', async () => {
      const mockData = [
        { slug: 'hm-test', title: 'Test', coverUrl: '', source: 'harimanga' as const, language: 'en' as const },
      ];
      mockFetchLatest.mockResolvedValue(mockData);

      await useLibraryStore.getState().loadLatest('new', 'en');

      const state = useLibraryStore.getState();
      expect(state.latestNew).toEqual(mockData);
      expect(state.loadingLatestNew).toBe(false);
    });

    it('allows concurrent loads of different types', async () => {
      const updatesData = [{ slug: 'mgk-a', title: 'A', coverUrl: '', source: 'mgeko' as const, language: 'en' as const }];
      const newData = [{ slug: 'hm-b', title: 'B', coverUrl: '', source: 'harimanga' as const, language: 'en' as const }];

      mockFetchLatest.mockImplementation(async (_lang, type) => {
        return type === 'updates' ? updatesData : newData;
      });

      await Promise.all([
        useLibraryStore.getState().loadLatest('updates', 'en'),
        useLibraryStore.getState().loadLatest('new', 'en'),
      ]);

      const state = useLibraryStore.getState();
      expect(state.latestUpdates).toEqual(updatesData);
      expect(state.latestNew).toEqual(newData);
    });

    it('resets loading flag on error', async () => {
      mockFetchLatest.mockRejectedValue(new Error('fail'));

      await useLibraryStore.getState().loadLatest('updates', 'en');

      expect(useLibraryStore.getState().loadingLatestUpdates).toBe(false);
    });
  });

  describe('doSearch', () => {
    it('debounces search and returns results', async () => {
      const results = [{ slug: 'naruto', title: 'Naruto', coverUrl: '', source: 'scanvf' as const, language: 'fr' as const }];
      mockSearch.mockResolvedValue(results);

      useLibraryStore.getState().doSearch('naruto', 'fr');
      expect(useLibraryStore.getState().searchLoading).toBe(true);

      await vi.advanceTimersByTimeAsync(300);

      expect(mockSearch).toHaveBeenCalledWith('naruto', 'fr');
      expect(useLibraryStore.getState().searchResults).toEqual(results);
      expect(useLibraryStore.getState().searchLoading).toBe(false);
    });

    it('clears results for empty query', async () => {
      useLibraryStore.setState({ searchResults: [{ slug: 'a', title: 'A', coverUrl: '', source: 'scanvf', language: 'fr' }], searchLoading: true });

      useLibraryStore.getState().doSearch('', 'fr');

      expect(useLibraryStore.getState().searchResults).toEqual([]);
      expect(useLibraryStore.getState().searchLoading).toBe(false);
    });

    it('cancels previous search when new one starts', async () => {
      mockSearch.mockResolvedValue([]);

      useLibraryStore.getState().doSearch('nar', 'fr');
      useLibraryStore.getState().doSearch('naruto', 'fr');

      await vi.advanceTimersByTimeAsync(300);

      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(mockSearch).toHaveBeenCalledWith('naruto', 'fr');
    });

    it('ignores stale search results after new search', async () => {
      let resolveFirst: (v: never[]) => void;
      const firstPromise = new Promise<never[]>((r) => { resolveFirst = r; });
      const secondResults = [{ slug: 'b', title: 'B', coverUrl: '', source: 'scanvf' as const, language: 'fr' as const }];

      mockSearch.mockImplementationOnce(() => firstPromise);
      mockSearch.mockImplementationOnce(async () => secondResults);

      // First search
      useLibraryStore.getState().doSearch('first', 'fr');
      await vi.advanceTimersByTimeAsync(300);

      // Second search before first resolves
      useLibraryStore.getState().doSearch('second', 'fr');
      await vi.advanceTimersByTimeAsync(300);

      // Resolve first (stale) — should be ignored
      resolveFirst!([] as never[]);
      await vi.advanceTimersByTimeAsync(0);

      expect(useLibraryStore.getState().searchResults).toEqual(secondResults);
    });
  });

  describe('reset', () => {
    it('clears all state including search', () => {
      useLibraryStore.setState({
        mangas: [{ slug: 'test', title: 'Test', coverUrl: '', source: 'scanvf', language: 'fr' }],
        search: 'naruto',
        searchResults: [{ slug: 'naruto', title: 'Naruto', coverUrl: '', source: 'scanvf', language: 'fr' }],
        searchLoading: true,
        loadedLang: 'fr',
      });

      useLibraryStore.getState().reset();

      const state = useLibraryStore.getState();
      expect(state.mangas).toEqual([]);
      expect(state.search).toBe('');
      expect(state.searchResults).toEqual([]);
      expect(state.searchLoading).toBe(false);
      expect(state.loadedLang).toBeNull();
    });

    it('clears pending search timer on reset', async () => {
      mockSearch.mockResolvedValue([{ slug: 'stale', title: 'Stale', coverUrl: '', source: 'scanvf' as const, language: 'fr' as const }]);

      useLibraryStore.getState().doSearch('stale', 'fr');
      useLibraryStore.getState().reset();

      await vi.advanceTimersByTimeAsync(300);

      expect(mockSearch).not.toHaveBeenCalled();
      expect(useLibraryStore.getState().searchResults).toEqual([]);
    });
  });

  describe('setSortMode', () => {
    it('updates sort mode', () => {
      useLibraryStore.getState().setSortMode('alphabetical');
      expect(useLibraryStore.getState().sortMode).toBe('alphabetical');
    });

    it('resets to default', () => {
      useLibraryStore.getState().setSortMode('alphabetical');
      useLibraryStore.getState().setSortMode('default');
      expect(useLibraryStore.getState().sortMode).toBe('default');
    });
  });
});
