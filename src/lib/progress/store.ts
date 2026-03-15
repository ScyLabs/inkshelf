import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { readingProgress, userMeta } from '@/lib/db/schema';
import type { ReadingProgress } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export async function readProgress(
  userId: string,
): Promise<Record<string, ReadingProgress>> {
  const db = getDb();
  const rows = await db
    .select({
      mangaSlug: readingProgress.mangaSlug,
      chapterSlug: readingProgress.chapterSlug,
      currentPage: readingProgress.currentPage,
      totalPages: readingProgress.totalPages,
      scrollPercent: readingProgress.scrollPercent,
      lastReadAt: readingProgress.lastReadAt,
      completed: readingProgress.completed,
    })
    .from(readingProgress)
    .where(eq(readingProgress.userId, userId));

  const result: Record<string, ReadingProgress> = {};
  for (const r of rows) {
    const key = `${r.mangaSlug}/${r.chapterSlug}`;
    result[key] = {
      mangaSlug: r.mangaSlug,
      chapterSlug: r.chapterSlug,
      currentPage: r.currentPage,
      totalPages: r.totalPages,
      scrollPercent: r.scrollPercent,
      lastReadAt: r.lastReadAt,
      completed: r.completed === 1,
    };
  }
  return result;
}

export async function writeProgress(
  userId: string,
  progress: Record<string, ReadingProgress>,
): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.delete(readingProgress).where(eq(readingProgress.userId, userId));
    for (const entry of Object.values(progress)) {
      await tx.insert(readingProgress)
        .values({
          userId,
          mangaSlug: entry.mangaSlug,
          chapterSlug: entry.chapterSlug,
          currentPage: entry.currentPage,
          totalPages: entry.totalPages,
          scrollPercent: entry.scrollPercent,
          lastReadAt: entry.lastReadAt,
          completed: entry.completed ? 1 : 0,
        });
    }
  });
  await touchUserMeta(userId);
}

export async function upsertEntry(
  userId: string,
  key: string,
  update: Partial<ReadingProgress>,
): Promise<void> {
  const db = getDb();
  const [mangaSlug, chapterSlug] = key.split('/');

  const rows = await db
    .select({
      currentPage: readingProgress.currentPage,
      totalPages: readingProgress.totalPages,
      scrollPercent: readingProgress.scrollPercent,
      lastReadAt: readingProgress.lastReadAt,
      completed: readingProgress.completed,
    })
    .from(readingProgress)
    .where(
      and(
        eq(readingProgress.userId, userId),
        eq(readingProgress.mangaSlug, mangaSlug),
        eq(readingProgress.chapterSlug, chapterSlug),
      )
    );

  const existing = rows[0];

  const merged = {
    currentPage: update.currentPage ?? existing?.currentPage ?? 0,
    totalPages: update.totalPages ?? existing?.totalPages ?? 0,
    scrollPercent: update.scrollPercent ?? existing?.scrollPercent ?? 0,
    lastReadAt: update.lastReadAt ?? existing?.lastReadAt ?? Date.now(),
    completed: update.completed ?? (existing ? existing.completed === 1 : false),
  };

  await db.insert(readingProgress)
    .values({
      userId,
      mangaSlug,
      chapterSlug,
      currentPage: merged.currentPage,
      totalPages: merged.totalPages,
      scrollPercent: merged.scrollPercent,
      lastReadAt: merged.lastReadAt,
      completed: merged.completed ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [readingProgress.userId, readingProgress.mangaSlug, readingProgress.chapterSlug],
      set: {
        currentPage: merged.currentPage,
        totalPages: merged.totalPages,
        scrollPercent: merged.scrollPercent,
        lastReadAt: merged.lastReadAt,
        completed: merged.completed ? 1 : 0,
      },
    });

  await touchUserMeta(userId);
}

export async function batchMarkCompleted(
  userId: string,
  mangaSlug: string,
  chapterSlugs: string[],
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.transaction(async (tx) => {
    for (let i = 0; i < chapterSlugs.length; i += 500) {
      const chunk = chapterSlugs.slice(i, i + 500);
      for (const chapterSlug of chunk) {
        await tx.insert(readingProgress)
          .values({
            userId,
            mangaSlug,
            chapterSlug,
            currentPage: 0,
            totalPages: 0,
            scrollPercent: 1,
            lastReadAt: now,
            completed: 1,
          })
          .onConflictDoUpdate({
            target: [readingProgress.userId, readingProgress.mangaSlug, readingProgress.chapterSlug],
            set: { scrollPercent: 1, lastReadAt: now, completed: 1 },
          });
      }
    }
  });
  await touchUserMeta(userId);
}

export async function touchUserMeta(userId: string): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.insert(userMeta)
    .values({ userId, lastUseAt: now })
    .onConflictDoUpdate({
      target: userMeta.userId,
      set: { lastUseAt: now },
    });
}

export async function getUserMeta(
  userId: string,
): Promise<{ lastUseAt: number } | null> {
  const db = getDb();
  const rows = await db
    .select({ lastUseAt: userMeta.lastUseAt })
    .from(userMeta)
    .where(eq(userMeta.userId, userId));

  return rows[0] ?? null;
}

export function mergeProgress(
  existing: Record<string, ReadingProgress>,
  incoming: Record<string, ReadingProgress>,
): Record<string, ReadingProgress> {
  const merged = { ...existing };
  for (const [key, entry] of Object.entries(incoming)) {
    const current = merged[key];
    if (!current || (typeof entry.lastReadAt === 'number' && entry.lastReadAt > (current.lastReadAt ?? 0))) {
      merged[key] = entry;
    }
  }
  return merged;
}
