import { sql } from 'drizzle-orm';
import { pgTable, text, integer, bigint, doublePrecision, index, primaryKey } from 'drizzle-orm/pg-core';

// ── Mangas ──────────────────────────────────────────────────────

export const mangas = pgTable('mangas', {
  slug: text('slug').primaryKey(),
  title: text('title').notNull(),
  coverUrl: text('cover_url'),
  source: text('source').notNull(),
  language: text('language').notNull(),
  fetchedAt: integer('fetched_at').notNull().default(sql`extract(epoch from now())::integer`),
  lastVerifiedAt: integer('last_verified_at').notNull().default(0),
  status: text('status').notNull().default('active'),
  knownChapterCount: integer('known_chapter_count').notNull().default(0),
  lastChapterCheckAt: integer('last_chapter_check_at').notNull().default(0),
}, (table) => [
  index('idx_mangas_source_lang').on(table.source, table.language),
  index('idx_mangas_status').on(table.status),
]);

// ── Chapters ────────────────────────────────────────────────────

export const chapters = pgTable('chapters', {
  slug: text('slug').notNull(),
  mangaSlug: text('manga_slug').notNull(),
  label: text('label').notNull(),
  type: text('type').notNull().default('chapter'),
  number: doublePrecision('number').notNull(),
  source: text('source').notNull(),
  fetchedAt: integer('fetched_at').notNull().default(sql`extract(epoch from now())::integer`),
  lastVerifiedAt: integer('last_verified_at').notNull().default(0),
  status: text('status').notNull().default('active'),
}, (table) => [
  primaryKey({ columns: [table.mangaSlug, table.slug] }),
  index('idx_chapters_status').on(table.mangaSlug, table.status),
]);

// ── Chapter Details ─────────────────────────────────────────────

export const chapterDetails = pgTable('chapter_details', {
  mangaSlug: text('manga_slug').notNull(),
  chapterSlug: text('chapter_slug').notNull(),
  title: text('title').notNull(),
  prevSlug: text('prev_slug'),
  nextSlug: text('next_slug'),
  source: text('source').notNull(),
  images: text('images').notNull(),
  fetchedAt: integer('fetched_at').notNull().default(sql`extract(epoch from now())::integer`),
  lastVerifiedAt: integer('last_verified_at').notNull().default(0),
  status: text('status').notNull().default('active'),
}, (table) => [
  primaryKey({ columns: [table.mangaSlug, table.chapterSlug] }),
]);

// ── Reading Progress ────────────────────────────────────────────

export const readingProgress = pgTable('reading_progress', {
  userId: text('user_id').notNull(),
  mangaSlug: text('manga_slug').notNull(),
  chapterSlug: text('chapter_slug').notNull(),
  currentPage: integer('current_page').notNull().default(0),
  totalPages: integer('total_pages').notNull().default(0),
  scrollPercent: doublePrecision('scroll_percent').notNull().default(0),
  lastReadAt: bigint('last_read_at', { mode: 'number' }).notNull(),
  completed: integer('completed').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.userId, table.mangaSlug, table.chapterSlug] }),
  index('idx_progress_user').on(table.userId),
]);

// ── Latest Updates ──────────────────────────────────────────────

export const latestUpdates = pgTable('latest_updates', {
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  coverUrl: text('cover_url'),
  source: text('source').notNull(),
  language: text('language').notNull(),
  latestChapter: text('latest_chapter'),
  sortedAt: integer('sorted_at').notNull().default(0),
  fetchedAt: integer('fetched_at').notNull().default(sql`extract(epoch from now())::integer`),
  lastVerifiedAt: integer('last_verified_at').notNull().default(0),
  status: text('status').notNull().default('active'),
}, (table) => [
  primaryKey({ columns: [table.slug, table.source] }),
  index('idx_latest_source_lang').on(table.source, table.language),
  index('idx_latest_status').on(table.source, table.language, table.status),
  index('idx_latest_sorted').on(table.source, table.language, table.sortedAt),
]);

// ── User Meta ───────────────────────────────────────────────────

export const userMeta = pgTable('user_meta', {
  userId: text('user_id').primaryKey(),
  lastUseAt: bigint('last_use_at', { mode: 'number' }).notNull(),
});

// ── User Library ────────────────────────────────────────────────

export const userLibrary = pgTable('user_library', {
  userId: text('user_id').notNull(),
  mangaSlug: text('manga_slug').notNull(),
  addedAt: bigint('added_at', { mode: 'number' }).notNull(),
  isFavorite: integer('is_favorite').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.userId, table.mangaSlug] }),
  index('idx_user_library_user').on(table.userId),
]);

// ── Manga Info ─────────────────────────────────────────────────

export const mangaInfo = pgTable('manga_info', {
  mangaSlug: text('manga_slug').primaryKey(),
  synopsis: text('synopsis'),
  author: text('author'),
  artist: text('artist'),
  genres: text('genres').notNull().default('[]'),
  status: text('status'),
  fetchedAt: integer('fetched_at').notNull().default(sql`extract(epoch from now())::integer`),
});

// ── Push Subscriptions ─────────────────────────────────────

export const pushSubscriptions = pgTable('push_subscriptions', {
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.endpoint] }),
  index('idx_push_subscriptions_user').on(table.userId),
]);

// ── User Settings ───────────────────────────────────────────────

export const userSettings = pgTable('user_settings', {
  userId: text('user_id').primaryKey(),
  readingMode: text('reading_mode').notNull().default('longstrip'),
  prefetchCount: integer('prefetch_count').notNull().default(3),
  autoNextChapter: integer('auto_next_chapter').notNull().default(1),
  language: text('language').notNull().default('fr'),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// ── Archive Jobs ────────────────────────────────────────────────

export const archiveJobs = pgTable('archive_jobs', {
  mangaSlug: text('manga_slug').primaryKey(),
  status: text('status').notNull().default('pending'),
  totalChapters: integer('total_chapters').notNull().default(0),
  downloadedChapters: integer('downloaded_chapters').notNull().default(0),
  totalImages: integer('total_images').notNull().default(0),
  downloadedImages: integer('downloaded_images').notNull().default(0),
  failedImages: integer('failed_images').notNull().default(0),
  error: text('error'),
  createdAt: integer('created_at').notNull().default(sql`extract(epoch from now())::integer`),
  updatedAt: integer('updated_at').notNull().default(sql`extract(epoch from now())::integer`),
});

// ── Archive Images ──────────────────────────────────────────────

export const archiveImages = pgTable('archive_images', {
  originalUrl: text('original_url').primaryKey(),
  mangaSlug: text('manga_slug').notNull(),
  chapterSlug: text('chapter_slug').notNull(),
  pageIndex: integer('page_index').notNull(),
  extension: text('extension').notNull(),
}, (table) => [
  index('idx_archive_images_manga').on(table.mangaSlug),
]);
