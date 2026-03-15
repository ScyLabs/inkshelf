import { getAllSources } from '@/lib/sources';
import { initDb } from '@/lib/db';
import { upsertMangas, markSourceStale } from '@/lib/db/cache';
import type { MangaSource } from '@/lib/sources/types';

async function scrapeSource(source: MangaSource): Promise<void> {
  try {
    console.log(`[scraper] Fetching ${source.id}...`);
    const mangas = await source.fetchMangaList();
    if (mangas.length > 0) {
      await upsertMangas(mangas);
      console.log(`[scraper] ${source.id}: ${mangas.length} mangas indexed`);
    } else {
      console.log(`[scraper] ${source.id}: 0 mangas (skipped upsert)`);
    }
  } catch (err) {
    console.error(`[scraper] ${source.id} failed:`, err);
    await markSourceStale(source.id);
  }
}

async function main(): Promise<void> {
  console.log('[scraper] Starting bulk scrape...');
  await initDb();
  const sources = getAllSources();
  for (const source of sources) {
    await scrapeSource(source);
  }
  console.log('[scraper] Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[scraper] Fatal error:', err);
    process.exit(1);
  });
