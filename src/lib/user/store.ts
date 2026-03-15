import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { userLibrary, userSettings, readingProgress } from '@/lib/db/schema';
import { readProgress, touchUserMeta } from '@/lib/progress/store';
import type { AppSettings, ReadingProgress, ReadingMode, Language } from '@/types';

export const DEFAULT_SETTINGS: AppSettings = {
  readingMode: 'longstrip',
  prefetchCount: 3,
  autoNextChapter: true,
  language: 'fr',
};

export async function readLibrary(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ mangaSlug: userLibrary.mangaSlug })
    .from(userLibrary)
    .where(eq(userLibrary.userId, userId))
    .orderBy(desc(userLibrary.addedAt));
  return rows.map(r => r.mangaSlug);
}

export async function writeLibrary(
  userId: string,
  slugs: string[],
): Promise<void> {
  const db = getDb();
  const now = Date.now();

  await db.transaction(async (tx) => {
    // Preserve favorite flags before bulk replace
    const favRows = await tx
      .select({ mangaSlug: userLibrary.mangaSlug })
      .from(userLibrary)
      .where(and(eq(userLibrary.userId, userId), eq(userLibrary.isFavorite, 1)));
    const favSet = new Set(favRows.map(r => r.mangaSlug));

    await tx.delete(userLibrary).where(eq(userLibrary.userId, userId));
    for (let i = 0; i < slugs.length; i++) {
      await tx.insert(userLibrary)
        .values({ userId, mangaSlug: slugs[i], addedAt: now + i, isFavorite: favSet.has(slugs[i]) ? 1 : 0 });
    }
  });
  await touchUserMeta(userId);
}

export async function addToLibrary(
  userId: string,
  mangaSlug: string,
): Promise<void> {
  const db = getDb();
  await db.insert(userLibrary)
    .values({ userId, mangaSlug, addedAt: Date.now() })
    .onConflictDoNothing();
  await touchUserMeta(userId);
}

export async function removeFromLibrary(
  userId: string,
  mangaSlug: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.delete(userLibrary)
      .where(and(eq(userLibrary.userId, userId), eq(userLibrary.mangaSlug, mangaSlug)));
    await tx.delete(readingProgress)
      .where(and(eq(readingProgress.userId, userId), eq(readingProgress.mangaSlug, mangaSlug)));
  });
  await touchUserMeta(userId);
}

export async function readFavorites(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ mangaSlug: userLibrary.mangaSlug })
    .from(userLibrary)
    .where(and(eq(userLibrary.userId, userId), eq(userLibrary.isFavorite, 1)))
    .orderBy(desc(userLibrary.addedAt));
  return rows.map(r => r.mangaSlug);
}

export async function toggleFavorite(
  userId: string,
  mangaSlug: string,
  favorite: boolean,
): Promise<void> {
  const db = getDb();
  await db.update(userLibrary)
    .set({ isFavorite: favorite ? 1 : 0 })
    .where(and(eq(userLibrary.userId, userId), eq(userLibrary.mangaSlug, mangaSlug)));
  await touchUserMeta(userId);
}

export async function readSettings(
  userId: string,
): Promise<AppSettings | null> {
  const db = getDb();
  const rows = await db
    .select({
      readingMode: userSettings.readingMode,
      prefetchCount: userSettings.prefetchCount,
      autoNextChapter: userSettings.autoNextChapter,
      language: userSettings.language,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  const row = rows[0];
  if (!row) return null;
  return {
    readingMode: row.readingMode as ReadingMode,
    prefetchCount: row.prefetchCount,
    autoNextChapter: row.autoNextChapter === 1,
    language: row.language as Language,
  };
}

export async function writeSettings(
  userId: string,
  settings: AppSettings,
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.insert(userSettings)
    .values({
      userId,
      readingMode: settings.readingMode,
      prefetchCount: settings.prefetchCount,
      autoNextChapter: settings.autoNextChapter ? 1 : 0,
      language: settings.language,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        readingMode: settings.readingMode,
        prefetchCount: settings.prefetchCount,
        autoNextChapter: settings.autoNextChapter ? 1 : 0,
        language: settings.language,
        updatedAt: now,
      },
    });
  await touchUserMeta(userId);
}

export async function readFullUserState(
  userId: string,
): Promise<{
  progress: Record<string, ReadingProgress>;
  library: string[];
  favorites: string[];
  settings: AppSettings;
}> {
  const progress = await readProgress(userId);
  const library = await readLibrary(userId);
  const favorites = await readFavorites(userId);
  const settings = (await readSettings(userId)) ?? DEFAULT_SETTINGS;
  return { progress, library, favorites, settings };
}
