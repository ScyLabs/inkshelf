import { create } from 'zustand';
import type { DownloadProgress } from '../services/offlineDownload';

export interface BulkDownloadState {
  mangaSlug: string;
  totalChapters: number;
  completedChapters: number;
  currentChapter: string;
  error: boolean;
}

interface DownloadState {
  downloaded: Record<string, number>;
  activeDownloads: Record<string, DownloadProgress>;
  bulkDownload: BulkDownloadState | null;
  markDownloaded: (mangaSlug: string, chapterSlug: string) => void;
  removeDownloaded: (mangaSlug: string, chapterSlug: string) => void;
  removeDownloadedWithCache: (mangaSlug: string, chapterSlug: string) => Promise<void>;
  clearAllDownloads: () => Promise<void>;
  isDownloaded: (mangaSlug: string, chapterSlug: string) => boolean;
  setActiveProgress: (mangaSlug: string, chapterSlug: string, progress: DownloadProgress) => void;
  clearActiveProgress: (mangaSlug: string, chapterSlug: string) => void;
  getActiveProgress: (mangaSlug: string, chapterSlug: string) => DownloadProgress | undefined;
  startBulkDownload: (mangaSlug: string, chapterSlugs: string[]) => void;
  cancelBulkDownload: () => void;
}

function dlKey(mangaSlug: string, chapterSlug: string): string {
  return `${mangaSlug}/${chapterSlug}`;
}

const STORAGE_KEY = 'manga-downloaded-chapters';

function loadDownloaded(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { /* ignore */ return {}; }
}

function saveDownloaded(downloaded: Record<string, number>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(downloaded)); } catch { /* ignore */ }
}

let bulkAbortController: AbortController | null = null;

export const useDownloadStore = create<DownloadState>()((set, get) => ({
  downloaded: loadDownloaded(),
  activeDownloads: {},
  bulkDownload: null,

  markDownloaded: (mangaSlug, chapterSlug) =>
    set((state) => {
      const updated = { ...state.downloaded, [dlKey(mangaSlug, chapterSlug)]: Date.now() };
      saveDownloaded(updated);
      return { downloaded: updated };
    }),

  removeDownloaded: (mangaSlug, chapterSlug) =>
    set((state) => {
      const updated = { ...state.downloaded };
      delete updated[dlKey(mangaSlug, chapterSlug)];
      saveDownloaded(updated);
      return { downloaded: updated };
    }),

  removeDownloadedWithCache: async (mangaSlug, chapterSlug) => {
    try {
      const { deleteOfflineChapter } = await import('../services/offlineDownload');
      await deleteOfflineChapter(mangaSlug, chapterSlug);
    } catch { /* best-effort */ }
    set((state) => {
      const updated = { ...state.downloaded };
      delete updated[dlKey(mangaSlug, chapterSlug)];
      saveDownloaded(updated);
      return { downloaded: updated };
    });
  },

  clearAllDownloads: async () => {
    try {
      const { deleteAllOfflineChapters } = await import('../services/offlineDownload');
      await deleteAllOfflineChapters();
    } catch { /* best-effort */ }
    saveDownloaded({});
    set({ downloaded: {} });
  },

  isDownloaded: (mangaSlug, chapterSlug) =>
    dlKey(mangaSlug, chapterSlug) in get().downloaded,

  setActiveProgress: (mangaSlug, chapterSlug, progress) =>
    set((state) => ({
      activeDownloads: { ...state.activeDownloads, [dlKey(mangaSlug, chapterSlug)]: progress },
    })),

  clearActiveProgress: (mangaSlug, chapterSlug) =>
    set((state) => {
      const updated = { ...state.activeDownloads };
      delete updated[dlKey(mangaSlug, chapterSlug)];
      return { activeDownloads: updated };
    }),

  getActiveProgress: (mangaSlug, chapterSlug) =>
    get().activeDownloads[dlKey(mangaSlug, chapterSlug)],

  startBulkDownload: (mangaSlug, chapterSlugs) => {
    const toDownload = chapterSlugs.filter(
      (slug) => !get().isDownloaded(mangaSlug, slug),
    );
    if (toDownload.length === 0) return;

    if (bulkAbortController) bulkAbortController.abort();
    const controller = new AbortController();
    bulkAbortController = controller;

    set({
      bulkDownload: {
        mangaSlug,
        totalChapters: toDownload.length,
        completedChapters: 0,
        currentChapter: toDownload[0] ?? '',
        error: false,
      },
    });

    (async () => {
      try {
        const { downloadManga } = await import('../services/offlineDownload');
        let lastCompletedChapter: string | null = null;
        let lastCompletedOk = false;

        const result = await downloadManga(mangaSlug, toDownload, (progress) => {
          if (controller.signal.aborted) return;

          // Detect chapter transitions to mark the previous one as downloaded
          if (lastCompletedChapter && lastCompletedOk && lastCompletedChapter !== progress.currentChapter) {
            get().markDownloaded(mangaSlug, lastCompletedChapter);
            lastCompletedChapter = null;
            lastCompletedOk = false;
          }

          // Track when a chapter's images finish without errors
          if (progress.currentImages.done === progress.currentImages.total && progress.currentImages.total > 0) {
            lastCompletedChapter = progress.currentChapter;
            lastCompletedOk = !progress.currentImages.error;
          }

          set({
            bulkDownload: {
              mangaSlug,
              totalChapters: progress.totalChapters,
              completedChapters: progress.completedChapters,
              currentChapter: progress.currentChapter,
              error: false,
            },
          });
        }, controller.signal);

        // Mark the very last chapter if it succeeded
        if (lastCompletedChapter && lastCompletedOk) {
          get().markDownloaded(mangaSlug, lastCompletedChapter);
        }
        // Also mark chapters that completed successfully via the result count
        // (downloadManga only increments `downloaded` for non-throwing chapters)
        if (!controller.signal.aborted && result.failed === 0) {
          set({ bulkDownload: null });
        } else if (!controller.signal.aborted) {
          set((s) => ({
            bulkDownload: s.bulkDownload ? { ...s.bulkDownload, error: true } : null,
          }));
        }
      } catch {
        if (!controller.signal.aborted) {
          set((s) => ({
            bulkDownload: s.bulkDownload ? { ...s.bulkDownload, error: true } : null,
          }));
        }
      } finally {
        if (bulkAbortController === controller) bulkAbortController = null;
      }
    })();
  },

  cancelBulkDownload: () => {
    if (bulkAbortController) {
      bulkAbortController.abort();
      bulkAbortController = null;
    }
    set({ bulkDownload: null });
  },
}));
