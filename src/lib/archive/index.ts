import { getArchiveJob, upsertArchiveJob, lookupArchiveImage } from '@/lib/db/cache';
import { getImagePath } from './storage';
import { wakeWorker } from './worker';
import { pathCacheGet, pathCacheSet } from './pathCache';

export { startArchiveWorker } from './worker';
export { pathCacheInvalidate as invalidatePathCache } from './pathCache';

// ── Public API ──────────────────────────────────────────────────

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

export async function enqueueArchive(mangaSlug: string): Promise<void> {
  const existing = await getArchiveJob(mangaSlug);
  if (existing && (existing.status === 'completed' || existing.status === 'downloading')) {
    return;
  }
  await upsertArchiveJob(mangaSlug, { status: 'pending', createdAt: nowEpoch() });
  wakeWorker();
}

export interface ArchiveStatus {
  status: string;
  totalChapters: number;
  downloadedChapters: number;
  totalImages: number;
  downloadedImages: number;
  failedImages: number;
  error: string | null;
}

export async function getArchiveStatus(mangaSlug: string): Promise<ArchiveStatus | null> {
  const job = await getArchiveJob(mangaSlug);
  if (!job) return null;
  return {
    status: job.status,
    totalChapters: job.totalChapters,
    downloadedChapters: job.downloadedChapters,
    totalImages: job.totalImages,
    downloadedImages: job.downloadedImages,
    failedImages: job.failedImages,
    error: job.error,
  };
}

export async function lookupLocalImage(originalUrl: string): Promise<string | null> {
  const cached = pathCacheGet(originalUrl);
  if (cached !== undefined) {
    return cached;
  }

  const row = await lookupArchiveImage(originalUrl);
  if (!row) {
    pathCacheSet(originalUrl, null);
    return null;
  }

  try {
    const filePath = getImagePath(row.mangaSlug, row.chapterSlug, row.pageIndex, row.extension);
    pathCacheSet(originalUrl, filePath);
    return filePath;
  } catch {
    pathCacheSet(originalUrl, null);
    return null;
  }
}

export async function enqueueNewChapters(mangaSlug: string): Promise<void> {
  const existing = await getArchiveJob(mangaSlug);
  if (!existing) return;
  if (existing.status === 'completed' || existing.status === 'partial' || existing.status === 'failed') {
    await upsertArchiveJob(mangaSlug, { status: 'pending' });
    wakeWorker();
  }
}
