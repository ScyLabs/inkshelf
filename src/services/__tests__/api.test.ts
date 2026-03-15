import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchMangaList, fetchMangaChapters, fetchMangaChapter, fetchCatalogue, fetchChapter, fetchLatestMangas } from '../api';

describe('api service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchMangaList', () => {
    it('fetches from /api/manga and returns JSON', async () => {
      const mockData = [{ slug: 'one_piece', title: 'One Piece', coverUrl: '' }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchMangaList();
      expect(fetch).toHaveBeenCalledWith('/api/manga');
      expect(result).toEqual(mockData);
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(fetchMangaList()).rejects.toThrow('Manga list fetch failed: 500');
    });
  });

  describe('fetchMangaChapters', () => {
    it('fetches from /api/manga/:slug/chapters and returns JSON', async () => {
      const mockData = [{ slug: 'chapitre-1', label: 'Chapitre 1', type: 'chapter', number: 1, mangaSlug: 'one_piece' }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchMangaChapters('one_piece');
      expect(fetch).toHaveBeenCalledWith('/api/manga/one_piece/chapters');
      expect(result).toEqual(mockData);
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 502,
      } as Response);

      await expect(fetchMangaChapters('one_piece')).rejects.toThrow('Chapters fetch failed: 502');
    });
  });

  describe('fetchMangaChapter', () => {
    it('fetches from /api/manga/:slug/chapter/:chapterSlug and returns JSON', async () => {
      const mockData = {
        images: ['https://c.sushiscan.net/img/01.webp'],
        prevSlug: null,
        nextSlug: 'chapitre-2',
        title: 'Chapter 1',
        mangaSlug: 'one_piece',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchMangaChapter('one_piece', 'chapitre-1');
      expect(fetch).toHaveBeenCalledWith('/api/manga/one_piece/chapter/chapitre-1');
      expect(result).toEqual(mockData);
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await expect(fetchMangaChapter('one_piece', 'invalid')).rejects.toThrow('Chapter fetch failed: 404');
    });
  });

  describe('fetchLatestMangas', () => {
    it('fetches from /api/manga/latest with correct params', async () => {
      const mockData = [{ slug: 'mgk-test', title: 'Test', coverUrl: '', source: 'mgeko', language: 'en' }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchLatestMangas('en', 'updates');
      expect(fetch).toHaveBeenCalledWith('/api/manga/latest?lang=en&type=updates');
      expect(result).toEqual(mockData);
    });

    it('passes type=new correctly', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response);

      await fetchLatestMangas('fr', 'new');
      expect(fetch).toHaveBeenCalledWith('/api/manga/latest?lang=fr&type=new');
    });

    it('throws on non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
      } as Response);

      await expect(fetchLatestMangas('en', 'updates')).rejects.toThrow('Latest mangas fetch failed: 503');
    });
  });

  describe('syncProgressToServer', () => {
    it('sends PUT to /api/progress/:userId with progress', async () => {
      const { syncProgressToServer } = await import('../api');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      const progress = {
        'one_piece/chapter-1': {
          chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 5, totalPages: 20,
          scrollPercent: 0.3, lastReadAt: 1000, completed: false,
        },
      };

      await syncProgressToServer('test-uuid', progress);
      expect(fetchSpy).toHaveBeenCalledWith('/api/progress/test-uuid', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress }),
      });
    });

    it('throws on non-ok response', async () => {
      const { syncProgressToServer } = await import('../api');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      } as Response);

      await expect(syncProgressToServer('test-uuid', {})).rejects.toThrow('Sync push failed: 500');
    });
  });

  describe('fetchProgressFromServer', () => {
    it('fetches GET /api/progress/:userId and returns progress', async () => {
      const { fetchProgressFromServer } = await import('../api');
      const mockProgress = {
        'one_piece/chapter-1': {
          chapterSlug: 'chapter-1', mangaSlug: 'one_piece', currentPage: 10, totalPages: 20,
          scrollPercent: 0.5, lastReadAt: 2000, completed: false,
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ progress: mockProgress }),
      } as Response);

      const result = await fetchProgressFromServer('test-uuid');
      expect(fetch).toHaveBeenCalledWith('/api/progress/test-uuid');
      expect(result).toEqual(mockProgress);
    });

    it('returns empty object when progress is null', async () => {
      const { fetchProgressFromServer } = await import('../api');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ progress: null }),
      } as Response);

      const result = await fetchProgressFromServer('test-uuid');
      expect(result).toEqual({});
    });
  });

  describe('pushSingleProgress', () => {
    it('sends PATCH to /api/progress/:userId/:manga/:chapter', async () => {
      const { pushSingleProgress } = await import('../api');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      const update = { currentPage: 5, scrollPercent: 0.3 };
      await pushSingleProgress('test-uuid', 'one_piece', 'chapter-1', update);
      expect(fetchSpy).toHaveBeenCalledWith('/api/progress/test-uuid/one_piece/chapter-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
    });

    it('throws on non-ok response', async () => {
      const { pushSingleProgress } = await import('../api');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
      } as Response);

      await expect(pushSingleProgress('test-uuid', 'one_piece', 'ch-1', {})).rejects.toThrow('Single progress push failed: 400');
    });
  });

  describe('fetchSyncCheck', () => {
    it('fetches GET /api/user/:userId/sync-check and returns lastUseAt', async () => {
      const { fetchSyncCheck } = await import('../api');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ lastUseAt: 1709337600 }),
      } as Response);

      const result = await fetchSyncCheck('test-uuid');
      expect(fetch).toHaveBeenCalledWith('/api/user/test-uuid/sync-check');
      expect(result).toBe(1709337600);
    });

    it('returns null when lastUseAt is missing', async () => {
      const { fetchSyncCheck } = await import('../api');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response);

      const result = await fetchSyncCheck('test-uuid');
      expect(result).toBeNull();
    });

    it('returns null on non-ok response', async () => {
      const { fetchSyncCheck } = await import('../api');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
      } as Response);

      const result = await fetchSyncCheck('test-uuid');
      expect(result).toBeNull();
    });
  });

  describe('deprecated wrappers', () => {
    it('fetchCatalogue delegates to fetchMangaChapters with one_piece', async () => {
      const mockData = [{ slug: 'chapitre-1', label: 'Chapitre 1', type: 'chapter', number: 1, mangaSlug: 'one_piece' }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchCatalogue();
      expect(fetch).toHaveBeenCalledWith('/api/manga/one_piece/chapters');
      expect(result).toEqual(mockData);
    });

    it('fetchChapter delegates to fetchMangaChapter with one_piece', async () => {
      const mockData = {
        images: ['https://c.sushiscan.net/img/01.webp'],
        prevSlug: null,
        nextSlug: 'chapitre-2',
        title: 'Chapter 1',
        mangaSlug: 'one_piece',
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await fetchChapter('chapitre-1');
      expect(fetch).toHaveBeenCalledWith('/api/manga/one_piece/chapter/chapitre-1');
      expect(result).toEqual(mockData);
    });
  });
});
