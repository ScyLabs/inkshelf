import type {
  MangaSource,
  MangaSourceResult,
  MangaInfo,
  ChapterResult,
  ChapterDetailResult,
} from './types';

const API_BASE = 'https://api.mangadex.org';
const COVERS_BASE = 'https://uploads.mangadex.org/covers';
const MANGA_LIMIT = 100;
const MAX_PAGES = 100;

const SLUG_PREFIX = 'md-';
const MANGA_SLUG_RE = /^md-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHAPTER_SLUG_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function toMangaSlug(mangaId: string): string {
  return `${SLUG_PREFIX}${mangaId}`;
}

function fromMangaSlug(slug: string): string | null {
  if (!slug.startsWith(SLUG_PREFIX)) return null;
  return slug.slice(SLUG_PREFIX.length);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    next: { revalidate: 3600 },
    headers: {
      'User-Agent': 'InkShelf/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`MangaDex API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

interface MangaDexManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles: Record<string, string>[];
    description?: Record<string, string>;
    status?: string;
    tags?: { attributes: { name: Record<string, string>; group: string } }[];
    lastChapter?: string | null;
    updatedAt?: string;
  };
  relationships: {
    type: string;
    attributes?: { fileName?: string; name?: string };
  }[];
}

interface MangaDexChapter {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    pages: number;
  };
}

interface MangaDexAtHome {
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

function getMangaTitle(manga: MangaDexManga): string {
  const t = manga.attributes.title;
  if (t.fr) return t.fr;
  if (t.en) return t.en;
  if (t['ja-ro']) return t['ja-ro'];
  const altFr = manga.attributes.altTitles.find((a) => a.fr);
  if (altFr) return altFr.fr;
  return Object.values(t)[0] ?? 'Unknown';
}

function getCoverUrl(manga: MangaDexManga): string {
  for (const rel of manga.relationships) {
    if (rel.type === 'cover_art' && rel.attributes?.fileName) {
      return `${COVERS_BASE}/${manga.id}/${rel.attributes.fileName}.256.jpg`;
    }
  }
  return '';
}

export function createMangaDexSource(): MangaSource {
  return {
    id: 'mangadex',
    language: 'fr',
    allowedImageHosts: ['uploads.mangadex.org', '*.mangadex.network'],

    async fetchMangaList(): Promise<MangaSourceResult[]> {
      const mangas: MangaSourceResult[] = [];
      const failedPages: number[] = [];
      let totalKnown = Infinity;

      async function fetchPage(page: number): Promise<boolean> {
        const offset = page * MANGA_LIMIT;
        const params = new URLSearchParams({
          limit: String(MANGA_LIMIT),
          offset: String(offset),
          'availableTranslatedLanguage[]': 'fr',
          'includes[]': 'cover_art',
          'order[followedCount]': 'desc',
          'contentRating[]': 'safe',
        });

        const data = await fetchJson<{ data: MangaDexManga[]; total: number }>(
          `${API_BASE}/manga?${params.toString()}`,
        );

        for (const manga of data.data) {
          mangas.push({
            slug: toMangaSlug(manga.id),
            title: getMangaTitle(manga),
            coverUrl: getCoverUrl(manga),
            source: 'mangadex',
            language: 'fr',
          });
        }

        totalKnown = data.total;
        return offset + MANGA_LIMIT < data.total && offset + MANGA_LIMIT < 10000;
      }

      // First pass
      for (let page = 0; page < MAX_PAGES; page++) {
        try {
          const hasMore = await fetchPage(page);
          if (!hasMore) break;
        } catch (err) {
          console.warn(`[mangadex] Page ${page} failed, will retry later:`, (err as Error).message);
          failedPages.push(page);
          // Don't break — keep going for subsequent pages
          const offset = (page + 1) * MANGA_LIMIT;
          if (offset >= 10000 || offset >= totalKnown) break;
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      // Retry failed pages (up to 2 attempts with increasing backoff)
      for (let attempt = 0; attempt < 2 && failedPages.length > 0; attempt++) {
        const retrying = [...failedPages];
        failedPages.length = 0;
        const delay = (attempt + 1) * 2000;
        console.log(`[mangadex] Retrying ${retrying.length} failed pages (attempt ${attempt + 1}, backoff ${delay}ms)...`);
        await new Promise((r) => setTimeout(r, delay));

        for (const page of retrying) {
          try {
            await fetchPage(page);
            console.log(`[mangadex] Page ${page} recovered on retry`);
          } catch (err) {
            console.warn(`[mangadex] Page ${page} still failing:`, (err as Error).message);
            failedPages.push(page);
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      if (failedPages.length > 0) {
        console.warn(`[mangadex] ${failedPages.length} pages permanently failed: [${failedPages.join(', ')}]`);
      }

      return mangas;
    },

    async fetchLatestUpdates(page = 1): Promise<MangaSourceResult[]> {
      const offset = (page - 1) * MANGA_LIMIT;
      const params = new URLSearchParams({
        limit: String(MANGA_LIMIT),
        offset: String(offset),
        'availableTranslatedLanguage[]': 'fr',
        'includes[]': 'cover_art',
        'order[updatedAt]': 'desc',
        'contentRating[]': 'safe',
      });

      const data = await fetchJson<{ data: MangaDexManga[]; total: number }>(
        `${API_BASE}/manga?${params.toString()}`,
      );

      return data.data.map((manga) => ({
        slug: toMangaSlug(manga.id),
        title: getMangaTitle(manga),
        coverUrl: getCoverUrl(manga),
        source: 'mangadex',
        language: 'fr',
        latestChapter: manga.attributes.lastChapter ? `Chapter ${manga.attributes.lastChapter}` : undefined,
        updatedAt: manga.attributes.updatedAt ? Math.floor(new Date(manga.attributes.updatedAt).getTime() / 1000) : undefined,
      }));
    },

    async fetchMangaInfo(mangaSlug: string): Promise<MangaInfo> {
      const mangaId = fromMangaSlug(mangaSlug);
      if (!mangaId || !MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }

      const params = new URLSearchParams();
      params.append('includes[]', 'author');
      params.append('includes[]', 'artist');
      params.append('includes[]', 'tag');

      const data = await fetchJson<{ data: MangaDexManga }>(
        `${API_BASE}/manga/${mangaId}?${params.toString()}`,
      );

      const manga = data.data;
      const desc = manga.attributes.description ?? {};
      const synopsis = desc.fr ?? desc.en ?? null;

      let author: string | null = null;
      let artist: string | null = null;
      for (const rel of manga.relationships) {
        if (rel.type === 'author' && rel.attributes?.name && !author) {
          author = rel.attributes.name;
        }
        if (rel.type === 'artist' && rel.attributes?.name && !artist) {
          artist = rel.attributes.name;
        }
      }

      const genres = (manga.attributes.tags ?? [])
        .filter((t) => t.attributes.group === 'genre')
        .map((t) => t.attributes.name.en ?? Object.values(t.attributes.name)[0] ?? '')
        .filter(Boolean);

      const status = manga.attributes.status ?? null;

      return { synopsis, author, artist, genres, status };
    },

    async fetchChapters(mangaSlug: string): Promise<ChapterResult[]> {
      const mangaId = fromMangaSlug(mangaSlug);
      if (!mangaId || !MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }

      const entries: ChapterResult[] = [];
      const seen = new Set<string>();
      let offset = 0;
      const limit = 100;

      while (true) {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
          'translatedLanguage[]': 'fr',
          'order[chapter]': 'asc',
        });

        const data = await fetchJson<{ data: MangaDexChapter[]; total: number }>(
          `${API_BASE}/manga/${mangaId}/feed?${params.toString()}`,
        );

        for (const ch of data.data) {
          const num = ch.attributes.chapter;
          if (!num || seen.has(num)) continue;
          seen.add(num);

          const label = ch.attributes.title
            ? `Chapter ${num} - ${ch.attributes.title}`
            : `Chapter ${num}`;

          entries.push({
            slug: ch.id,
            label,
            type: 'chapter',
            number: parseFloat(num),
            mangaSlug,
            source: 'mangadex',
          });
        }

        if (offset + limit >= data.total) break;
        offset += limit;
      }

      entries.sort((a, b) => a.number - b.number);
      return entries;
    },

    async fetchChapter(mangaSlug: string, chapterSlug: string): Promise<ChapterDetailResult> {
      const mangaId = fromMangaSlug(mangaSlug);
      if (!mangaId || !MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }
      if (!CHAPTER_SLUG_RE.test(chapterSlug)) {
        throw new Error('Invalid chapter slug format');
      }

      const atHome = await fetchJson<MangaDexAtHome>(
        `${API_BASE}/at-home/server/${chapterSlug}`,
      );

      const images = atHome.chapter.dataSaver.map(
        (file) => `${atHome.baseUrl}/data-saver/${atHome.chapter.hash}/${file}`,
      );

      if (images.length === 0) {
        throw new Error('No images found for chapter');
      }

      // Get prev/next by fetching nearby chapters
      const chapterData = await fetchJson<{ data: { attributes: { chapter: string | null } } }>(
        `${API_BASE}/chapter/${chapterSlug}`,
      );
      const currentNum = chapterData.data.attributes.chapter
        ? parseFloat(chapterData.data.attributes.chapter)
        : 0;

      let prevSlug: string | null = null;
      let nextSlug: string | null = null;

      // Get previous chapter
      const prevParams = new URLSearchParams({
        limit: '1',
        'translatedLanguage[]': 'fr',
        'order[chapter]': 'desc',
        'chapter[]': String(currentNum - 1),
      });
      // Try to find adjacent chapters
      try {
        const prevData = await fetchJson<{ data: MangaDexChapter[] }>(
          `${API_BASE}/manga/${mangaId}/feed?${prevParams.toString()}`,
        );
        if (prevData.data.length > 0) {
          prevSlug = prevData.data[0].id;
        }
      } catch { /* no prev */ }

      const nextParams = new URLSearchParams({
        limit: '1',
        'translatedLanguage[]': 'fr',
        'order[chapter]': 'asc',
        'chapter[]': String(currentNum + 1),
      });
      try {
        const nextData = await fetchJson<{ data: MangaDexChapter[] }>(
          `${API_BASE}/manga/${mangaId}/feed?${nextParams.toString()}`,
        );
        if (nextData.data.length > 0) {
          nextSlug = nextData.data[0].id;
        }
      } catch { /* no next */ }

      const title = chapterData.data.attributes.chapter
        ? `Chapter ${chapterData.data.attributes.chapter}`
        : 'Chapter';

      return { images, prevSlug, nextSlug, title, mangaSlug, source: 'mangadex' };
    },
  };
}
