import { getAllSources, resolveSourceFromMangaSlug } from '@/lib/sources';
import { upsertMangas, upsertLatest, upsertChapters, markSourceStale, getMangasToCheck, updateChapterCheck, isInAnyLibrary } from '@/lib/db/cache';
import { notifyNewChapters } from '@/lib/push';
import { enqueueNewChapters } from '@/lib/archive';
import type { MangaSource, MangaSourceResult } from '@/lib/sources/types';

const SCRAPE_INTERVAL = 55 * 60 * 1000; // 55 minutes
const INITIAL_DELAY = 5_000;
const CHECK_BATCH_SIZE = 500;

const SOURCE_DELAYS: Record<string, number> = {
  mangadex: 300,
  scanvf: 200,
  mangapill: 200,
  mgeko: 200,
  harimanga: 200,
};

interface ScrapeStatus {
  source: string;
  language: string;
  mangaCount: number;
  lastScrapeAt: number | null;
  lastError: string | null;
  scraping: boolean;
}

const statuses = new Map<string, ScrapeStatus>();
let isRunning = false;
let _started = false;

async function scrapeSource(source: MangaSource): Promise<void> {
  const status = statuses.get(source.id);
  if (!status) return;
  status.scraping = true;
  try {
    console.log(`[scraper] Fetching ${source.id}...`);
    const mangas = await source.fetchMangaList();
    if (mangas.length > 0) {
      await upsertMangas(mangas);
      console.log(`[scraper] ${source.id}: ${mangas.length} mangas indexed`);
    }
    status.mangaCount = mangas.length;
    status.lastScrapeAt = Date.now();
    status.lastError = null;
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    console.error(`[scraper] ${source.id} failed (stored data preserved):`, err);
    await markSourceStale(source.id);
  } finally {
    status.scraping = false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkChaptersBatch(): Promise<void> {
  const batch = await getMangasToCheck(CHECK_BATCH_SIZE);
  if (batch.length === 0) return;

  console.log(`[scraper] Checking chapters for ${batch.length} mangas...`);
  let updatedCount = 0;

  for (const manga of batch) {
    try {
      const source = resolveSourceFromMangaSlug(manga.slug);
      if (!source) {
        await updateChapterCheck(manga.slug, manga.knownChapterCount);
        continue;
      }

      const freshChapters = await source.fetchChapters(manga.slug);
      const freshCount = freshChapters.length;

      const hasNewChapters = manga.knownChapterCount > 0 && freshCount > manga.knownChapterCount;
      if (hasNewChapters) {
        const latestEntry: MangaSourceResult = {
          slug: manga.slug,
          title: manga.title,
          coverUrl: manga.coverUrl ?? '',
          source: source.id,
          language: source.language,
          latestChapter: freshChapters[freshChapters.length - 1]?.label,
        };
        await upsertLatest([latestEntry]);
        await upsertChapters(manga.slug, freshChapters);
        updatedCount++;

        if (process.env.VAPID_PUBLIC_KEY) {
          const latestLabel = freshChapters[freshChapters.length - 1]?.label ?? '';
          notifyNewChapters(manga.slug, manga.title, latestLabel).catch(err =>
            console.error(`[scraper] Push notification failed for ${manga.slug}:`, err)
          );
        }

        isInAnyLibrary(manga.slug).then(followed => {
          if (followed) enqueueNewChapters(manga.slug).catch(err => console.error('[archive] New chapters enqueue failed:', err));
        }).catch(err => console.error('[archive] isInAnyLibrary check failed:', err));
      }

      await updateChapterCheck(manga.slug, freshCount);

      const delayMs = SOURCE_DELAYS[source.id] ?? 200;
      await delay(delayMs);
    } catch (err) {
      console.error(`[scraper] Chapter check failed for ${manga.slug}:`, err);
      await updateChapterCheck(manga.slug, manga.knownChapterCount);
    }
  }

  console.log(`[scraper] Chapter check complete: ${updatedCount} mangas with new chapters`);
}

async function scrapeAllSources(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const sources = getAllSources();
    for (const source of sources) {
      await scrapeSource(source);
    }
    await checkChaptersBatch();
  } finally {
    isRunning = false;
  }
}

export function startScheduler(): void {
  if (_started) return;
  _started = true;
  // Initialize statuses
  for (const source of getAllSources()) {
    statuses.set(source.id, {
      source: source.id,
      language: source.language,
      mangaCount: 0,
      lastScrapeAt: null,
      lastError: null,
      scraping: false,
    });
  }
  console.log('[scraper] Scheduler started');
  setTimeout(() => {
    scrapeAllSources();
    setInterval(scrapeAllSources, SCRAPE_INTERVAL);
  }, INITIAL_DELAY);
}

export function getScraperStatus(): ScrapeStatus[] {
  return [...statuses.values()];
}

export function triggerManualScrape(): void {
  if (isRunning) return;
  scrapeAllSources().catch(err => console.error('[scraper] Manual scrape failed:', err));
}
