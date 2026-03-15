import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://onepiece:onepiece@localhost:5432/onepiece';

let _sql: ReturnType<typeof postgres> | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;
let _initPromise: Promise<void> | null = null;

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    _sql = postgres(DATABASE_URL, { max: 10 });
  }
  return _sql;
}

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    _db = drizzle(getSql(), { schema });
  }
  return _db;
}

export function initDb(): Promise<void> {
  if (!_initPromise) {
    _initPromise = (async () => {
      const sql = getSql();
      await sql.unsafe(SCHEMA);
      await runMigrations(sql);
    })();
  }
  return _initPromise;
}

async function runMigrations(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL DEFAULT 0)`;

  const rows = await sql`SELECT version FROM schema_version`;
  let version: number;
  if (rows.length === 0) {
    await sql`INSERT INTO schema_version (version) VALUES (0)`;
    version = 0;
  } else {
    version = rows[0].version;
  }

  if (version < 3) {
    await sql`UPDATE schema_version SET version = 3`;
  }

  if (version < 4) {
    await sql`ALTER TABLE reading_progress ALTER COLUMN last_read_at TYPE BIGINT`;
    await sql`ALTER TABLE user_meta ALTER COLUMN last_use_at TYPE BIGINT`;
    await sql`ALTER TABLE user_library ALTER COLUMN added_at TYPE BIGINT`;
    await sql`ALTER TABLE user_settings ALTER COLUMN updated_at TYPE BIGINT`;
    await sql`UPDATE schema_version SET version = 4`;
  }

  if (version < 5) {
    await sql`ALTER TABLE latest_updates ADD COLUMN IF NOT EXISTS sorted_at INTEGER NOT NULL DEFAULT 0`;
    await sql`CREATE INDEX IF NOT EXISTS idx_latest_sorted ON latest_updates(source, language, sorted_at DESC)`;
    await sql`UPDATE schema_version SET version = 5`;
  }

  if (version < 6) {
    await sql`ALTER TABLE mangas ADD COLUMN IF NOT EXISTS known_chapter_count INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE mangas ADD COLUMN IF NOT EXISTS last_chapter_check_at INTEGER NOT NULL DEFAULT 0`;
    await sql`CREATE INDEX IF NOT EXISTS idx_mangas_chapter_check ON mangas(status, last_chapter_check_at ASC)`;
    await sql`
      UPDATE mangas SET known_chapter_count = COALESCE(
        (SELECT COUNT(*) FROM chapters WHERE chapters.manga_slug = mangas.slug AND chapters.status = 'active'), 0
      )
    `;
    await sql`UPDATE schema_version SET version = 6`;
  }

  if (version < 7) {
    await sql`ALTER TABLE user_library ADD COLUMN IF NOT EXISTS is_favorite INTEGER NOT NULL DEFAULT 0`;
    await sql`UPDATE schema_version SET version = 7`;
  }

  if (version < 8) {
    await sql`CREATE TABLE IF NOT EXISTS manga_info (
      manga_slug TEXT PRIMARY KEY,
      synopsis TEXT,
      author TEXT,
      artist TEXT,
      genres TEXT NOT NULL DEFAULT '[]',
      status TEXT,
      fetched_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer
    )`;
    await sql`UPDATE schema_version SET version = 8`;
  }

  if (version < 9) {
    await sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, endpoint)
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)`;
    await sql`UPDATE schema_version SET version = 9`;
  }

  if (version < 10) {
    await sql`CREATE TABLE IF NOT EXISTS archive_jobs (
      manga_slug TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      total_chapters INTEGER NOT NULL DEFAULT 0,
      downloaded_chapters INTEGER NOT NULL DEFAULT 0,
      total_images INTEGER NOT NULL DEFAULT 0,
      downloaded_images INTEGER NOT NULL DEFAULT 0,
      failed_images INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer,
      updated_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer
    )`;
    await sql`CREATE TABLE IF NOT EXISTS archive_images (
      original_url TEXT PRIMARY KEY,
      manga_slug TEXT NOT NULL,
      chapter_slug TEXT NOT NULL,
      page_index INTEGER NOT NULL,
      extension TEXT NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_archive_images_manga ON archive_images(manga_slug)`;
    await sql`UPDATE schema_version SET version = 10`;
  }

  if (version < 11) {
    // Enqueue archive jobs for library mangas added before the archive feature existed
    await sql`
      INSERT INTO archive_jobs (manga_slug, status, created_at, updated_at)
      SELECT DISTINCT ul.manga_slug, 'pending', extract(epoch from now())::integer, extract(epoch from now())::integer
      FROM user_library ul
      WHERE NOT EXISTS (
        SELECT 1 FROM archive_jobs WHERE archive_jobs.manga_slug = ul.manga_slug
      )
    `;
    await sql`UPDATE schema_version SET version = 11`;
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS mangas (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    cover_url TEXT,
    source TEXT NOT NULL,
    language TEXT NOT NULL,
    fetched_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer,
    last_verified_at INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    known_chapter_count INTEGER NOT NULL DEFAULT 0,
    last_chapter_check_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_mangas_source_lang ON mangas(source, language);
  CREATE INDEX IF NOT EXISTS idx_mangas_status ON mangas(status);

  CREATE TABLE IF NOT EXISTS chapters (
    slug TEXT NOT NULL,
    manga_slug TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'chapter',
    number DOUBLE PRECISION NOT NULL,
    source TEXT NOT NULL,
    fetched_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer,
    last_verified_at INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (manga_slug, slug)
  );
  CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(manga_slug, status);

  CREATE TABLE IF NOT EXISTS chapter_details (
    manga_slug TEXT NOT NULL,
    chapter_slug TEXT NOT NULL,
    title TEXT NOT NULL,
    prev_slug TEXT,
    next_slug TEXT,
    source TEXT NOT NULL,
    images TEXT NOT NULL,
    fetched_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer,
    last_verified_at INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (manga_slug, chapter_slug)
  );

  CREATE TABLE IF NOT EXISTS reading_progress (
    user_id TEXT NOT NULL,
    manga_slug TEXT NOT NULL,
    chapter_slug TEXT NOT NULL,
    current_page INTEGER NOT NULL DEFAULT 0,
    total_pages INTEGER NOT NULL DEFAULT 0,
    scroll_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_read_at BIGINT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, manga_slug, chapter_slug)
  );
  CREATE INDEX IF NOT EXISTS idx_progress_user ON reading_progress(user_id);

  CREATE TABLE IF NOT EXISTS latest_updates (
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    cover_url TEXT,
    source TEXT NOT NULL,
    language TEXT NOT NULL,
    latest_chapter TEXT,
    sorted_at INTEGER NOT NULL DEFAULT 0,
    fetched_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer,
    last_verified_at INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (slug, source)
  );
  CREATE INDEX IF NOT EXISTS idx_latest_source_lang ON latest_updates(source, language);
  CREATE INDEX IF NOT EXISTS idx_latest_status ON latest_updates(source, language, status);
  CREATE INDEX IF NOT EXISTS idx_latest_sorted ON latest_updates(source, language, sorted_at DESC);

  CREATE TABLE IF NOT EXISTS user_meta (
    user_id TEXT PRIMARY KEY,
    last_use_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_library (
    user_id TEXT NOT NULL,
    manga_slug TEXT NOT NULL,
    added_at BIGINT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, manga_slug)
  );
  CREATE INDEX IF NOT EXISTS idx_user_library_user ON user_library(user_id);

  CREATE TABLE IF NOT EXISTS manga_info (
    manga_slug TEXT PRIMARY KEY,
    synopsis TEXT,
    author TEXT,
    artist TEXT,
    genres TEXT NOT NULL DEFAULT '[]',
    status TEXT,
    fetched_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, endpoint)
  );
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    reading_mode TEXT NOT NULL DEFAULT 'longstrip',
    prefetch_count INTEGER NOT NULL DEFAULT 3,
    auto_next_chapter INTEGER NOT NULL DEFAULT 1,
    language TEXT NOT NULL DEFAULT 'fr',
    updated_at BIGINT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS archive_jobs (
    manga_slug TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    total_chapters INTEGER NOT NULL DEFAULT 0,
    downloaded_chapters INTEGER NOT NULL DEFAULT 0,
    total_images INTEGER NOT NULL DEFAULT 0,
    downloaded_images INTEGER NOT NULL DEFAULT 0,
    failed_images INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer,
    updated_at INTEGER NOT NULL DEFAULT extract(epoch from now())::integer
  );

  CREATE TABLE IF NOT EXISTS archive_images (
    original_url TEXT PRIMARY KEY,
    manga_slug TEXT NOT NULL,
    chapter_slug TEXT NOT NULL,
    page_index INTEGER NOT NULL,
    extension TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_archive_images_manga ON archive_images(manga_slug);
`;
