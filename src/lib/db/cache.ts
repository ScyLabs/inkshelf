import { eq, and, asc, desc, sql, ilike, inArray } from 'drizzle-orm';
import { getDb } from './index';
import { mangas, chapters, chapterDetails, latestUpdates, mangaInfo, archiveJobs, archiveImages, userLibrary } from './schema';
import type { MangaSourceResult, MangaInfo, ChapterResult, ChapterDetailResult } from '@/lib/sources/types';

function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}

// ── Mangas ──────────────────────────────────────────────────────

export async function getCachedMangas(source: string, language: string): Promise<MangaSourceResult[] | null> {
  const db = getDb();
  const rows = await db
    .select({
      slug: mangas.slug,
      title: mangas.title,
      coverUrl: mangas.coverUrl,
      source: mangas.source,
      language: mangas.language,
      knownChapterCount: mangas.knownChapterCount,
    })
    .from(mangas)
    .where(and(eq(mangas.source, source), eq(mangas.language, language)));

  if (rows.length === 0) return null;
  return rows.map((r) => ({
    ...r,
    coverUrl: r.coverUrl ?? '',
    source: r.source as MangaSourceResult['source'],
    language: r.language as MangaSourceResult['language'],
  }));
}

export async function upsertMangas(list: MangaSourceResult[]): Promise<void> {
  if (list.length === 0) return;

  const db = getDb();
  const now = nowEpoch();

  const BATCH = 500;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    await db.insert(mangas)
      .values(batch.map(m => ({
        slug: m.slug,
        title: m.title,
        coverUrl: m.coverUrl,
        source: m.source,
        language: m.language,
        fetchedAt: now,
        lastVerifiedAt: now,
        status: 'active',
      })))
      .onConflictDoUpdate({
        target: mangas.slug,
        set: {
          title: sql`excluded.title`,
          coverUrl: sql`excluded.cover_url`,
          source: sql`excluded.source`,
          language: sql`excluded.language`,
          fetchedAt: sql`excluded.fetched_at`,
          lastVerifiedAt: sql`excluded.last_verified_at`,
          status: sql`excluded.status`,
        },
      });
  }
}

// ── Search ──────────────────────────────────────────────────────

export async function searchMangas(query: string, language?: string): Promise<MangaSourceResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const db = getDb();
  const escaped = trimmed.replace(/%/g, '\\%').replace(/_/g, '\\_');
  const pattern = `%${escaped}%`;

  const conditions = [ilike(mangas.title, pattern)];
  if (language) {
    conditions.push(eq(mangas.language, language));
  }

  const rows = await db
    .select({
      slug: mangas.slug,
      title: mangas.title,
      coverUrl: mangas.coverUrl,
      source: mangas.source,
      language: mangas.language,
      knownChapterCount: mangas.knownChapterCount,
    })
    .from(mangas)
    .where(and(...conditions))
    .limit(100);

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    coverUrl: r.coverUrl ?? '',
    source: r.source as MangaSourceResult['source'],
    language: r.language as MangaSourceResult['language'],
    knownChapterCount: r.knownChapterCount ?? 0,
  }));
}

// ── Chapters ────────────────────────────────────────────────────

export async function getCachedChapters(mangaSlug: string): Promise<ChapterResult[] | null> {
  const db = getDb();
  const rows = await db
    .select({
      slug: chapters.slug,
      label: chapters.label,
      type: chapters.type,
      number: chapters.number,
      mangaSlug: chapters.mangaSlug,
      source: chapters.source,
    })
    .from(chapters)
    .where(eq(chapters.mangaSlug, mangaSlug))
    .orderBy(asc(chapters.number));

  if (rows.length === 0) return null;
  return rows.map((r) => ({
    ...r,
    type: r.type as ChapterResult['type'],
    source: r.source as ChapterResult['source'],
  }));
}

export async function upsertChapters(mangaSlug: string, list: ChapterResult[]): Promise<void> {
  if (list.length === 0) return;

  const db = getDb();
  const now = nowEpoch();

  const BATCH = 500;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    await db.insert(chapters)
      .values(batch.map(c => ({
        slug: c.slug,
        mangaSlug,
        label: c.label,
        type: c.type,
        number: c.number,
        source: c.source,
        fetchedAt: now,
        lastVerifiedAt: now,
        status: 'active',
      })))
      .onConflictDoUpdate({
        target: [chapters.mangaSlug, chapters.slug],
        set: {
          label: sql`excluded.label`,
          type: sql`excluded.type`,
          number: sql`excluded.number`,
          source: sql`excluded.source`,
          fetchedAt: sql`excluded.fetched_at`,
          lastVerifiedAt: sql`excluded.last_verified_at`,
          status: sql`excluded.status`,
        },
      });
  }
}

// ── Chapter Details ─────────────────────────────────────────────

export async function getCachedChapterDetail(mangaSlug: string, chapterSlug: string): Promise<ChapterDetailResult | null> {
  const db = getDb();
  const rows = await db
    .select({
      title: chapterDetails.title,
      prevSlug: chapterDetails.prevSlug,
      nextSlug: chapterDetails.nextSlug,
      source: chapterDetails.source,
      images: chapterDetails.images,
    })
    .from(chapterDetails)
    .where(and(eq(chapterDetails.mangaSlug, mangaSlug), eq(chapterDetails.chapterSlug, chapterSlug)));

  const row = rows[0];
  if (!row) return null;
  return {
    images: JSON.parse(row.images),
    prevSlug: row.prevSlug,
    nextSlug: row.nextSlug,
    title: row.title,
    mangaSlug,
    source: row.source as ChapterDetailResult['source'],
  };
}

export async function upsertChapterDetail(mangaSlug: string, chapterSlug: string, detail: ChapterDetailResult): Promise<void> {
  const db = getDb();
  const now = nowEpoch();

  await db.insert(chapterDetails)
    .values({
      mangaSlug,
      chapterSlug,
      title: detail.title,
      prevSlug: detail.prevSlug,
      nextSlug: detail.nextSlug,
      source: detail.source,
      images: JSON.stringify(detail.images),
      fetchedAt: now,
      lastVerifiedAt: now,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: [chapterDetails.mangaSlug, chapterDetails.chapterSlug],
      set: {
        title: detail.title,
        prevSlug: detail.prevSlug,
        nextSlug: detail.nextSlug,
        source: detail.source,
        images: JSON.stringify(detail.images),
        fetchedAt: now,
        lastVerifiedAt: now,
        status: 'active',
      },
    });
}

// ── Latest Updates ─────────────────────────────────────────────

export async function getCachedLatest(source: string, language: string): Promise<MangaSourceResult[] | null> {
  const db = getDb();
  const rows = await db
    .select({
      slug: latestUpdates.slug,
      title: latestUpdates.title,
      coverUrl: latestUpdates.coverUrl,
      source: latestUpdates.source,
      language: latestUpdates.language,
      latestChapter: latestUpdates.latestChapter,
      sortedAt: latestUpdates.sortedAt,
    })
    .from(latestUpdates)
    .where(and(eq(latestUpdates.source, source), eq(latestUpdates.language, language), eq(latestUpdates.status, 'active')))
    .orderBy(desc(latestUpdates.sortedAt));

  if (rows.length === 0) return null;
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    coverUrl: r.coverUrl ?? '',
    source: r.source as MangaSourceResult['source'],
    language: r.language as MangaSourceResult['language'],
    ...(r.latestChapter ? { latestChapter: r.latestChapter } : {}),
    ...(r.sortedAt ? { updatedAt: r.sortedAt } : {}),
  }));
}

export async function upsertLatest(list: MangaSourceResult[]): Promise<void> {
  if (list.length === 0) return;

  const db = getDb();
  const now = nowEpoch();

  const BATCH = 500;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    await db.insert(latestUpdates)
      .values(batch.map(m => ({
        slug: m.slug,
        title: m.title,
        coverUrl: m.coverUrl,
        source: m.source,
        language: m.language,
        latestChapter: m.latestChapter ?? null,
        sortedAt: m.updatedAt ?? now,
        fetchedAt: now,
        lastVerifiedAt: now,
        status: 'active',
      })))
      .onConflictDoUpdate({
        target: [latestUpdates.slug, latestUpdates.source],
        set: {
          title: sql`excluded.title`,
          coverUrl: sql`excluded.cover_url`,
          language: sql`excluded.language`,
          latestChapter: sql`excluded.latest_chapter`,
          sortedAt: sql`excluded.sorted_at`,
          fetchedAt: sql`excluded.fetched_at`,
          lastVerifiedAt: sql`excluded.last_verified_at`,
          status: sql`excluded.status`,
        },
      });
  }
}

// ── Scraper Status (read from DB) ─────────────────────────────

export async function getScraperStatusFromDb(): Promise<{ source: string; language: string; mangaCount: number; lastScrapeAt: number | null }[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT source, language, COUNT(*) as manga_count, MAX(fetched_at) as last_scrape_at
    FROM mangas WHERE status = 'active' GROUP BY source, language
  `);

  return rows.map((r: Record<string, unknown>) => ({
    source: r.source as string,
    language: r.language as string,
    mangaCount: Number(r.manga_count),
    lastScrapeAt: r.last_scrape_at ? Number(r.last_scrape_at) * 1000 : null,
  }));
}

// ── Chapter Checking ──────────────────────────────────────────

export async function getMangasToCheck(batchSize: number): Promise<{
  slug: string;
  title: string;
  coverUrl: string | null;
  source: string;
  language: string;
  knownChapterCount: number;
}[]> {
  const db = getDb();
  return db
    .select({
      slug: mangas.slug,
      title: mangas.title,
      coverUrl: mangas.coverUrl,
      source: mangas.source,
      language: mangas.language,
      knownChapterCount: mangas.knownChapterCount,
    })
    .from(mangas)
    .where(eq(mangas.status, 'active'))
    .orderBy(asc(mangas.lastChapterCheckAt))
    .limit(batchSize);
}

export async function updateChapterCheck(slug: string, chapterCount: number): Promise<void> {
  const db = getDb();
  const now = nowEpoch();
  await db
    .update(mangas)
    .set({
      knownChapterCount: chapterCount,
      lastChapterCheckAt: now,
    })
    .where(eq(mangas.slug, slug));
}

export async function markSourceStale(sourceId: string): Promise<void> {
  const db = getDb();
  const now = nowEpoch();

  await db.transaction(async (tx) => {
    await tx.update(mangas)
      .set({ status: 'stale', lastVerifiedAt: now })
      .where(and(eq(mangas.source, sourceId), eq(mangas.status, 'active')));

    await tx.update(latestUpdates)
      .set({ status: 'stale', lastVerifiedAt: now })
      .where(and(eq(latestUpdates.source, sourceId), eq(latestUpdates.status, 'active')));
  });
}

// ── Manga Info ─────────────────────────────────────────────────

export async function getCachedMangaInfo(mangaSlug: string): Promise<MangaInfo | null> {
  const db = getDb();
  const rows = await db
    .select({
      synopsis: mangaInfo.synopsis,
      author: mangaInfo.author,
      artist: mangaInfo.artist,
      genres: mangaInfo.genres,
      status: mangaInfo.status,
    })
    .from(mangaInfo)
    .where(eq(mangaInfo.mangaSlug, mangaSlug));

  const row = rows[0];
  if (!row) return null;
  let genres: string[] = [];
  try { genres = JSON.parse(row.genres); } catch { /* malformed JSON fallback */ }
  return {
    synopsis: row.synopsis,
    author: row.author,
    artist: row.artist,
    genres,
    status: row.status,
  };
}

export async function upsertMangaInfo(mangaSlug: string, info: MangaInfo): Promise<void> {
  const db = getDb();
  const now = nowEpoch();

  await db.insert(mangaInfo)
    .values({
      mangaSlug,
      synopsis: info.synopsis,
      author: info.author,
      artist: info.artist,
      genres: JSON.stringify(info.genres),
      status: info.status,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: mangaInfo.mangaSlug,
      set: {
        synopsis: sql`excluded.synopsis`,
        author: sql`excluded.author`,
        artist: sql`excluded.artist`,
        genres: sql`excluded.genres`,
        status: sql`excluded.status`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    });
}

// ── Chapter Counts (for dedup) ─────────────────────────────────

export async function getChapterCounts(slugs: string[]): Promise<Map<string, number>> {
  if (slugs.length === 0) return new Map();
  const db = getDb();
  const result = new Map<string, number>();
  const BATCH = 500;
  for (let i = 0; i < slugs.length; i += BATCH) {
    const batch = slugs.slice(i, i + BATCH);
    const rows = await db
      .select({ slug: mangas.slug, count: mangas.knownChapterCount })
      .from(mangas)
      .where(inArray(mangas.slug, batch));
    for (const r of rows) result.set(r.slug, r.count ?? 0);
  }
  return result;
}

// ── Archive Jobs ────────────────────────────────────────────────

export type ArchiveJob = typeof archiveJobs.$inferSelect;
export type ArchiveImage = typeof archiveImages.$inferSelect;

export async function getArchiveJob(mangaSlug: string): Promise<ArchiveJob | null> {
  const db = getDb();
  const rows = await db.select().from(archiveJobs).where(eq(archiveJobs.mangaSlug, mangaSlug));
  return rows[0] ?? null;
}

export async function getAllArchiveJobs(): Promise<ArchiveJob[]> {
  const db = getDb();
  return db.select().from(archiveJobs);
}

export async function upsertArchiveJob(mangaSlug: string, data: Partial<Omit<ArchiveJob, 'mangaSlug'>>): Promise<void> {
  const db = getDb();
  const now = nowEpoch();
  await db.insert(archiveJobs)
    .values({
      mangaSlug,
      ...data,
      createdAt: data.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: archiveJobs.mangaSlug,
      set: {
        ...data,
        updatedAt: now,
      },
    });
}

export async function insertArchiveImages(rows: { originalUrl: string; mangaSlug: string; chapterSlug: string; pageIndex: number; extension: string }[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db.insert(archiveImages)
      .values(batch)
      .onConflictDoNothing();
  }
}

export async function lookupArchiveImage(originalUrl: string): Promise<ArchiveImage | null> {
  const db = getDb();
  const rows = await db.select().from(archiveImages).where(eq(archiveImages.originalUrl, originalUrl));
  return rows[0] ?? null;
}

// ── Library Helpers (for archive) ───────────────────────────────

export async function isInAnyLibrary(mangaSlug: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ mangaSlug: userLibrary.mangaSlug })
    .from(userLibrary)
    .where(eq(userLibrary.mangaSlug, mangaSlug))
    .limit(1);
  return rows.length > 0;
}
