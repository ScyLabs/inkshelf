import { resolveSourceFromMangaSlug } from '@/lib/sources';
import {
  getCachedChapters,
  getCachedChapterDetail,
  upsertChapterDetail,
  upsertArchiveJob,
  insertArchiveImages,
  getAllArchiveJobs,
} from '@/lib/db/cache';
import type { ChapterResult, ChapterDetailResult } from '@/lib/sources/types';
import { saveImage } from './storage';
import { pathCacheInvalidate } from './pathCache';

const POLL_INTERVAL = 60_000; // 60s
const IMAGE_CONCURRENCY = 3;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1_000;

const SOURCE_DELAYS: Record<string, number> = {
  mangadex: 300,
};

const REFERER_MAP: Record<string, string> = {
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let _started = false;
let isProcessing = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.toLowerCase();
    if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) {
      return ext;
    }
  } catch {
    // fallback
  }
  return 'jpg';
}

function getReferer(imageUrl: string): string {
  try {
    const hostname = new URL(imageUrl).hostname;
    return REFERER_MAP[hostname] ?? `https://${hostname}/`;
  } catch {
    return '';
  }
}

async function fetchImageBuffer(imageUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
  const referer = getReferer(imageUrl);
  const response = await fetch(imageUrl, {
    headers: {
      'Referer': referer,
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${imageUrl}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error(`Non-image content-type: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function downloadChapterImages(
  mangaSlug: string,
  chapterSlug: string,
  images: string[],
  sourceId: string,
): Promise<{ downloaded: number; failed: number }> {
  let downloaded = 0;
  let failed = 0;

  const queue = images.map((url, index) => ({ url, index }));
  const dbRows: { originalUrl: string; mangaSlug: string; chapterSlug: string; pageIndex: number; extension: string }[] = [];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      const ext = extractExtension(item.url);
      let success = false;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const { buffer } = await fetchImageBuffer(item.url);
          await saveImage(mangaSlug, chapterSlug, item.index, buffer, ext);
          pathCacheInvalidate(item.url);
          dbRows.push({
            originalUrl: item.url,
            mangaSlug,
            chapterSlug,
            pageIndex: item.index,
            extension: ext,
          });
          downloaded++;
          success = true;
          break;
        } catch (err) {
          if (attempt < MAX_RETRIES - 1) {
            await delay(RETRY_DELAY_MS);
          } else {
            console.error(`[archive] Failed to download image ${item.index} for ${chapterSlug} after ${MAX_RETRIES} attempts:`, err);
          }
        }
      }

      if (!success) {
        failed++;
      }
    }
  }

  const workerCount = Math.min(IMAGE_CONCURRENCY, images.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  // Batch insert all downloaded image records
  if (dbRows.length > 0) {
    await insertArchiveImages(dbRows);
  }

  // Per-source delay
  const delayMs = SOURCE_DELAYS[sourceId] ?? 200;
  await delay(delayMs);

  return { downloaded, failed };
}

async function archiveManga(mangaSlug: string): Promise<void> {
  const source = resolveSourceFromMangaSlug(mangaSlug);
  if (!source) {
    await upsertArchiveJob(mangaSlug, { status: 'failed', error: `No source found for slug: ${mangaSlug}` });
    return;
  }

  // Fetch chapters (try source first, fallback to cache)
  let chapterList: ChapterResult[] | null = null;
  try {
    chapterList = await source.fetchChapters(mangaSlug);
  } catch (err) {
    console.error(`[archive] Failed to fetch chapters from source for ${mangaSlug}, trying cache:`, err);
  }
  if (!chapterList || chapterList.length === 0) {
    chapterList = await getCachedChapters(mangaSlug);
  }
  if (!chapterList || chapterList.length === 0) {
    await upsertArchiveJob(mangaSlug, { status: 'failed', error: 'No chapters found' });
    return;
  }

  await upsertArchiveJob(mangaSlug, {
    status: 'downloading',
    totalChapters: chapterList.length,
    downloadedChapters: 0,
    totalImages: 0,
    downloadedImages: 0,
    failedImages: 0,
  });

  let totalDownloaded = 0;
  let totalFailed = 0;
  let totalImages = 0;
  let downloadedChapters = 0;

  for (const chapter of chapterList) {
    // Fetch chapter detail (try source first, fallback to cache)
    let detail: ChapterDetailResult | null = null;
    try {
      detail = await source.fetchChapter(mangaSlug, chapter.slug);
      // Cache it for future use
      await upsertChapterDetail(mangaSlug, chapter.slug, detail);
    } catch (err) {
      console.error(`[archive] Failed to fetch chapter ${chapter.slug} from source, trying cache:`, err);
    }
    if (!detail) {
      detail = await getCachedChapterDetail(mangaSlug, chapter.slug);
    }
    if (!detail || detail.images.length === 0) {
      console.error(`[archive] No images found for chapter ${chapter.slug}, skipping`);
      downloadedChapters++;
      continue;
    }

    totalImages += detail.images.length;
    const { downloaded, failed } = await downloadChapterImages(mangaSlug, chapter.slug, detail.images, source.id);
    totalDownloaded += downloaded;
    totalFailed += failed;
    downloadedChapters++;

    // Update progress in DB
    await upsertArchiveJob(mangaSlug, {
      status: 'downloading',
      downloadedChapters,
      totalImages,
      downloadedImages: totalDownloaded,
      failedImages: totalFailed,
    });
  }

  // Final status
  const finalStatus = totalFailed === 0 ? 'completed' : 'partial';
  await upsertArchiveJob(mangaSlug, {
    status: finalStatus,
    downloadedChapters,
    totalImages,
    downloadedImages: totalDownloaded,
    failedImages: totalFailed,
  });

  console.log(`[archive] ${mangaSlug}: ${finalStatus} (${totalDownloaded}/${totalImages} images, ${totalFailed} failed)`);
}

async function processNextJob(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const jobs = await getAllArchiveJobs();
    // Pick oldest pending or downloading job
    const job = jobs
      .filter((j) => j.status === 'pending' || j.status === 'downloading')
      .sort((a, b) => a.createdAt - b.createdAt)[0];

    if (!job) return;

    console.log(`[archive] Processing job: ${job.mangaSlug} (status: ${job.status})`);
    await archiveManga(job.mangaSlug);
  } catch (err) {
    console.error('[archive] processNextJob error:', err);
  } finally {
    isProcessing = false;
  }
}

export function startArchiveWorker(): void {
  if (_started) return;
  _started = true;
  console.log('[archive] Worker started');
  setInterval(() => {
    processNextJob().catch((err) => console.error('[archive] Poll error:', err));
  }, POLL_INTERVAL);
}

export function wakeWorker(): void {
  processNextJob().catch((err) => console.error('[archive] Wake error:', err));
}
