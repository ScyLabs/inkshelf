import { fetchMangaChapter } from './api';
import { buildProxyImageUrl } from './imageProxy';
import type { ChapterData } from '../types';

const PROXY_IMAGES_CACHE = 'proxy-images';

export interface DownloadProgress {
  total: number;
  done: number;
  error: boolean;
}

const CONCURRENCY = 3;
const OFFLINE_CACHE = 'offline-chapters';
const OFFLINE_PAGES_CACHE = 'offline-pages';

async function cacheChapterData(
  mangaSlug: string,
  chapterSlug: string,
  data: ChapterData,
): Promise<void> {
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const url = `/api/manga/${mangaSlug}/chapter/${chapterSlug}`;
    await cache.put(url, new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch {
    // silently fail
  }
}

export async function getOfflineCachedChapter(
  mangaSlug: string,
  chapterSlug: string,
): Promise<ChapterData | null> {
  try {
    const cache = await caches.open(OFFLINE_CACHE);
    const url = `/api/manga/${mangaSlug}/chapter/${chapterSlug}`;
    const response = await cache.match(url);
    if (!response) return null;
    return await response.json() as ChapterData;
  } catch {
    return null;
  }
}

async function cacheReaderPage(
  mangaSlug: string,
  chapterSlug: string,
): Promise<void> {
  const url = `/read/${mangaSlug}/${chapterSlug}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch reader page: ${response.status}`);
  const cache = await caches.open(OFFLINE_PAGES_CACHE);
  await cache.put(url, response);
}

export async function downloadChapter(
  mangaSlug: string,
  chapterSlug: string,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const chapter = await fetchMangaChapter(mangaSlug, chapterSlug);
  await cacheChapterData(mangaSlug, chapterSlug, chapter);
  // Fire in background — must not delay image downloads
  const pageCachePromise = cacheReaderPage(mangaSlug, chapterSlug).catch(() => {});

  const urls = chapter.images.map(buildProxyImageUrl);
  const total = urls.length;
  let done = 0;
  let hasError = false;

  onProgress({ total, done, error: false });

  const queue = [...urls];

  async function worker() {
    while (queue.length > 0) {
      if (signal?.aborted) break;
      const url = queue.shift();
      if (!url) break;
      try {
        const resp = await fetch(url, signal ? { signal } : undefined);
        if (!resp.ok) hasError = true;
        await resp.blob();
      } catch {
        if (signal?.aborted) break;
        hasError = true;
      }
      done++;
      onProgress({ total, done, error: hasError });
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
  await Promise.all(workers);

  await pageCachePromise;
  if (hasError) throw new Error('Some images failed to download');
}

export async function deleteOfflineChapter(
  mangaSlug: string,
  chapterSlug: string,
): Promise<void> {
  try {
    const metaCache = await caches.open(OFFLINE_CACHE);
    const url = `/api/manga/${mangaSlug}/chapter/${chapterSlug}`;

    // Read metadata to get image URLs before deleting
    const response = await metaCache.match(url);
    if (response) {
      try {
        const data = (await response.json()) as ChapterData;
        const imgCache = await caches.open(PROXY_IMAGES_CACHE);
        await Promise.all(
          data.images.map((img) => imgCache.delete(buildProxyImageUrl(img))),
        );
      } catch {
        // image cleanup is best-effort
      }
    }

    await metaCache.delete(url);

    // Clean up cached reader page
    try {
      const pageCache = await caches.open(OFFLINE_PAGES_CACHE);
      await pageCache.delete(`/read/${mangaSlug}/${chapterSlug}`);
    } catch {
      // best-effort
    }
  } catch {
    // silently fail
  }
}

export interface BulkDownloadProgress {
  totalChapters: number;
  completedChapters: number;
  currentChapter: string;
  currentImages: DownloadProgress;
}

export async function downloadManga(
  mangaSlug: string,
  chapterSlugs: string[],
  onProgress: (progress: BulkDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<{ downloaded: number; failed: number }> {
  const totalChapters = chapterSlugs.length;
  let completedChapters = 0;
  let failedCount = 0;

  for (const chapterSlug of chapterSlugs) {
    if (signal?.aborted) break;

    onProgress({
      totalChapters,
      completedChapters,
      currentChapter: chapterSlug,
      currentImages: { total: 0, done: 0, error: false },
    });

    try {
      await downloadChapter(mangaSlug, chapterSlug, (p) => {
        onProgress({
          totalChapters,
          completedChapters,
          currentChapter: chapterSlug,
          currentImages: p,
        });
      }, signal);
    } catch {
      failedCount++;
    }
    completedChapters++;
  }

  return { downloaded: completedChapters - failedCount, failed: failedCount };
}

export async function deleteAllOfflineChapters(): Promise<void> {
  try {
    const metaCache = await caches.open(OFFLINE_CACHE);
    const imgCache = await caches.open(PROXY_IMAGES_CACHE);
    const keys = await metaCache.keys();
    for (const req of keys) {
      try {
        const resp = await metaCache.match(req);
        if (resp) {
          const data = (await resp.json()) as ChapterData;
          await Promise.all(
            data.images.map((img) => imgCache.delete(buildProxyImageUrl(img))),
          );
        }
      } catch { /* best-effort per entry */ }
    }
    await caches.delete(OFFLINE_CACHE);
    await caches.delete(OFFLINE_PAGES_CACHE);
  } catch {
    // silently fail
  }
}
