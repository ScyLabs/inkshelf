import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDownloadStore } from '../downloadStore';

// Mock offlineDownload service (dynamic import)
vi.mock('../../services/offlineDownload', () => ({
  deleteOfflineChapter: vi.fn(async () => {}),
  deleteAllOfflineChapters: vi.fn(async () => {}),
}));

const MANGA = 'one_piece';
const CHAPTER = 'chapter-1';

describe('downloadStore', () => {
  beforeEach(() => {
    useDownloadStore.setState({ downloaded: {}, activeDownloads: {} });
  });

  it('starts with empty state', () => {
    const state = useDownloadStore.getState();
    expect(state.downloaded).toEqual({});
    expect(state.activeDownloads).toEqual({});
  });

  describe('markDownloaded', () => {
    it('marks a chapter as downloaded with timestamp', () => {
      const { markDownloaded } = useDownloadStore.getState();
      const before = Date.now();
      markDownloaded(MANGA, CHAPTER);

      const state = useDownloadStore.getState();
      const key = `${MANGA}/${CHAPTER}`;
      expect(state.downloaded[key]).toBeDefined();
      expect(state.downloaded[key]).toBeGreaterThanOrEqual(before);
    });

    it('marks multiple chapters', () => {
      const { markDownloaded } = useDownloadStore.getState();
      markDownloaded(MANGA, 'chapter-1');
      markDownloaded(MANGA, 'chapter-2');
      markDownloaded('other-manga', 'chapter-1');

      const state = useDownloadStore.getState();
      expect(Object.keys(state.downloaded)).toHaveLength(3);
    });
  });

  describe('isDownloaded', () => {
    it('returns false for non-downloaded chapter', () => {
      const { isDownloaded } = useDownloadStore.getState();
      expect(isDownloaded(MANGA, CHAPTER)).toBe(false);
    });

    it('returns true for downloaded chapter', () => {
      const { markDownloaded } = useDownloadStore.getState();
      markDownloaded(MANGA, CHAPTER);
      expect(useDownloadStore.getState().isDownloaded(MANGA, CHAPTER)).toBe(true);
    });
  });

  describe('removeDownloaded', () => {
    it('removes a downloaded chapter', () => {
      const { markDownloaded } = useDownloadStore.getState();
      markDownloaded(MANGA, CHAPTER);
      expect(useDownloadStore.getState().isDownloaded(MANGA, CHAPTER)).toBe(true);

      useDownloadStore.getState().removeDownloaded(MANGA, CHAPTER);
      expect(useDownloadStore.getState().isDownloaded(MANGA, CHAPTER)).toBe(false);
    });

    it('does nothing for non-existing chapter', () => {
      const { removeDownloaded } = useDownloadStore.getState();
      removeDownloaded(MANGA, CHAPTER);
      expect(useDownloadStore.getState().downloaded).toEqual({});
    });
  });

  describe('activeDownloads', () => {
    it('sets active progress', () => {
      const { setActiveProgress } = useDownloadStore.getState();
      setActiveProgress(MANGA, CHAPTER, { total: 20, done: 5, error: false });

      const progress = useDownloadStore.getState().getActiveProgress(MANGA, CHAPTER);
      expect(progress).toEqual({ total: 20, done: 5, error: false });
    });

    it('returns undefined for non-active download', () => {
      const progress = useDownloadStore.getState().getActiveProgress(MANGA, CHAPTER);
      expect(progress).toBeUndefined();
    });

    it('clears active progress', () => {
      const { setActiveProgress, clearActiveProgress } = useDownloadStore.getState();
      setActiveProgress(MANGA, CHAPTER, { total: 20, done: 20, error: false });
      clearActiveProgress(MANGA, CHAPTER);

      expect(useDownloadStore.getState().getActiveProgress(MANGA, CHAPTER)).toBeUndefined();
    });

    it('updates progress incrementally', () => {
      const { setActiveProgress } = useDownloadStore.getState();
      setActiveProgress(MANGA, CHAPTER, { total: 10, done: 0, error: false });
      setActiveProgress(MANGA, CHAPTER, { total: 10, done: 5, error: false });
      setActiveProgress(MANGA, CHAPTER, { total: 10, done: 10, error: false });

      const progress = useDownloadStore.getState().getActiveProgress(MANGA, CHAPTER);
      expect(progress).toEqual({ total: 10, done: 10, error: false });
    });

    it('tracks error state', () => {
      const { setActiveProgress } = useDownloadStore.getState();
      setActiveProgress(MANGA, CHAPTER, { total: 10, done: 3, error: true });

      const progress = useDownloadStore.getState().getActiveProgress(MANGA, CHAPTER);
      expect(progress?.error).toBe(true);
    });
  });

  describe('removeDownloadedWithCache', () => {
    it('removes from state and calls deleteOfflineChapter', async () => {
      const { markDownloaded } = useDownloadStore.getState();
      markDownloaded(MANGA, CHAPTER);
      expect(useDownloadStore.getState().isDownloaded(MANGA, CHAPTER)).toBe(true);

      await useDownloadStore.getState().removeDownloadedWithCache(MANGA, CHAPTER);

      expect(useDownloadStore.getState().isDownloaded(MANGA, CHAPTER)).toBe(false);
      const { deleteOfflineChapter } = await import('../../services/offlineDownload');
      expect(deleteOfflineChapter).toHaveBeenCalledWith(MANGA, CHAPTER);
    });

    it('still removes from state when cache delete fails', async () => {
      const { deleteOfflineChapter } = await import('../../services/offlineDownload');
      vi.mocked(deleteOfflineChapter).mockRejectedValueOnce(new Error('Cache error'));

      const { markDownloaded } = useDownloadStore.getState();
      markDownloaded(MANGA, CHAPTER);

      await useDownloadStore.getState().removeDownloadedWithCache(MANGA, CHAPTER);
      expect(useDownloadStore.getState().isDownloaded(MANGA, CHAPTER)).toBe(false);
    });
  });

  describe('clearAllDownloads', () => {
    it('clears all downloads and calls deleteAllOfflineChapters', async () => {
      const { markDownloaded } = useDownloadStore.getState();
      markDownloaded(MANGA, 'chapter-1');
      markDownloaded(MANGA, 'chapter-2');
      markDownloaded('other-manga', 'chapter-1');
      expect(Object.keys(useDownloadStore.getState().downloaded)).toHaveLength(3);

      await useDownloadStore.getState().clearAllDownloads();

      expect(useDownloadStore.getState().downloaded).toEqual({});
      const { deleteAllOfflineChapters } = await import('../../services/offlineDownload');
      expect(deleteAllOfflineChapters).toHaveBeenCalled();
    });

    it('still clears state when cache delete fails', async () => {
      const { deleteAllOfflineChapters } = await import('../../services/offlineDownload');
      vi.mocked(deleteAllOfflineChapters).mockRejectedValueOnce(new Error('Cache error'));

      const { markDownloaded } = useDownloadStore.getState();
      markDownloaded(MANGA, CHAPTER);

      await useDownloadStore.getState().clearAllDownloads();
      expect(useDownloadStore.getState().downloaded).toEqual({});
    });
  });
});
