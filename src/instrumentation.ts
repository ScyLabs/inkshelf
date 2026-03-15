import { initDb } from '@/lib/db';
import { startScheduler } from '@/lib/scraper/scheduler';
import { startArchiveWorker } from '@/lib/archive';

export async function register(): Promise<void> {
  await initDb();
  startScheduler();
  startArchiveWorker();
}
