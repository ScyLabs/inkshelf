import type {
  MangaSource,
  MangaSourceResult,
  MangaInfo,
  ChapterResult,
  ChapterDetailResult,
} from './types';

const BASE_URL = 'https://mangapill.com';
const MAX_PAGES = 999;

// Cover image card: <a href="/manga/{id}/{slug}" class="relative block"><figure ...><img data-src="...">
const MANGA_CARD_RE =
  /<a\s+href="\/manga\/(\d+)\/([^"]+)"\s+class="relative block">\s*<figure[^>]*>\s*<img\s+data-src="([^"]+)"/g;

// Title card: <a href="/manga/{id}/{slug}" class="mb-2"><div ...>Title</div>
const MANGA_TITLE_CARD_RE =
  /<a\s+href="\/manga\/(\d+)\/([^"]+)"\s+class="mb-2">\s*<div[^>]*>([^<]+)<\/div>/g;

// Chapter links: <a ... href="/chapters/{chapterIdSlug}/{mangaSlug}-chapter-{num}" ...>Chapter {num}</a>
const CHAPTER_LINK_RE =
  /href="\/chapters\/([\w-]+)\/([^"]+)-chapter-(\d+(?:\.\d+)?)"/g;

// Chapter images: <img class="js-page" data-src="{url}" ...>
const CHAPTER_IMG_RE = /class="js-page"\s+data-src="([^"]+)"/g;

// Navigation: <a href="/chapters/{id-slug}/{full-slug}" ... data-hotkey="ArrowLeft|ArrowRight" ...>
const NAV_PREV_RE =
  /href="\/chapters\/([\w-]+\/[^"]+)"\s+class="[^"]*"\s+data-hotkey="ArrowLeft"/;
const NAV_NEXT_RE =
  /href="\/chapters\/([\w-]+\/[^"]+)"\s+class="[^"]*"\s+data-hotkey="ArrowRight"/;

const MANGA_SLUG_RE = /^mp-\d+-[a-zA-Z0-9-]+$/;
const CHAPTER_SLUG_RE = /^\d+-\d+--[\w][\w-]*-chapter-\d+(?:\.\d+)?$/;

// Manga info regex patterns
const MP_SYNOPSIS_RE = /<p class="text-sm text--secondary">([\s\S]*?)<\/p>/;
const MP_STATUS_RE = /<label class="text-secondary">Status<\/label>\s*<div>([^<]+)<\/div>/;
const MP_GENRE_RE = /href="\/search\?genre=[^"]*">([^<]+)<\/a>/g;

function toMangaPillSlug(id: string, slug: string): string {
  return `mp-${id}-${slug}`;
}

function fromMangaPillSlug(mpSlug: string): { id: string; slug: string } | null {
  const match = mpSlug.match(/^mp-(\d+)-(.+)$/);
  if (!match) return null;
  return { id: match[1], slug: match[2] };
}

function toChapterSlug(chapterIdSlug: string, mangaSlug: string, num: string): string {
  return `${chapterIdSlug}--${mangaSlug}-chapter-${num}`;
}

function parseChapterSlug(slug: string): string | null {
  const idx = slug.indexOf('--');
  if (idx === -1) return null;
  return slug.substring(0, idx) + '/' + slug.substring(idx + 2);
}

async function fetchHtml(url: string): Promise<string | null> {
  const response = await fetch(url, {
    next: { revalidate: 3600 },
    headers: {
      'Referer': 'https://mangapill.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });
  if (!response.ok) return null;
  return response.text();
}

export function createMangaPillSource(): MangaSource {
  return {
    id: 'mangapill',
    language: 'en',
    allowedImageHosts: ['cdn.readdetectiveconan.com'],

    async fetchMangaList(): Promise<MangaSourceResult[]> {
      const seen = new Set<string>();
      const mangas: MangaSourceResult[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        let html: string | null;
        try {
          html = await fetchHtml(`${BASE_URL}/search?q=&type=manga&page=${page}`);
        } catch (err) {
          console.error(`[mangapill] Page ${page} failed (keeping ${mangas.length} mangas):`, err);
          break;
        }
        if (!html) break;

        // Extract cover images: keyed by "id/slug"
        const covers = new Map<string, string>();
        MANGA_CARD_RE.lastIndex = 0;
        let cardMatch: RegExpExecArray | null;
        while ((cardMatch = MANGA_CARD_RE.exec(html)) !== null) {
          covers.set(`${cardMatch[1]}/${cardMatch[2]}`, cardMatch[3]);
        }

        // Extract titles and build manga list
        MANGA_TITLE_CARD_RE.lastIndex = 0;
        let titleMatch: RegExpExecArray | null;
        let foundAny = false;

        while ((titleMatch = MANGA_TITLE_CARD_RE.exec(html)) !== null) {
          const id = titleMatch[1];
          const rawSlug = titleMatch[2];
          const key = `${id}/${rawSlug}`;
          if (seen.has(key)) continue;
          seen.add(key);
          foundAny = true;

          const coverUrl = covers.get(key) || `${BASE_URL}/static/favicon/android-chrome-512x512.png`;

          mangas.push({
            slug: toMangaPillSlug(id, rawSlug),
            title: titleMatch[3].trim(),
            coverUrl,
            source: 'mangapill',
            language: 'en',
          });
        }

        if (!foundAny) break;
      }

      return mangas;
    },

    async fetchMangaInfo(mangaSlug: string): Promise<MangaInfo> {
      if (!MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }
      const parsed = fromMangaPillSlug(mangaSlug);
      if (!parsed) {
        throw new Error('Invalid MangaPill slug format');
      }

      const url = `${BASE_URL}/manga/${parsed.id}/${parsed.slug}`;
      const html = await fetchHtml(url);
      if (!html) {
        throw new Error('Failed to fetch manga page');
      }

      const synMatch = html.match(MP_SYNOPSIS_RE);
      let synopsis: string | null = null;
      if (synMatch) {
        synopsis = synMatch[1]
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/\[Written by MAL Rewrite\]\s*$/i, '')
          .trim() || null;
      }

      const genres: string[] = [];
      MP_GENRE_RE.lastIndex = 0;
      let gm: RegExpExecArray | null;
      while ((gm = MP_GENRE_RE.exec(html)) !== null) {
        const g = gm[1].trim();
        if (g) genres.push(g);
      }

      const statusMatch = html.match(MP_STATUS_RE);
      let status: string | null = null;
      if (statusMatch) {
        const raw = statusMatch[1].trim().toLowerCase();
        if (raw === 'publishing') status = 'ongoing';
        else if (raw === 'finished') status = 'completed';
        else if (raw.includes('hiatus')) status = 'hiatus';
        else if (raw.includes('discontinued')) status = 'cancelled';
        else status = raw || null;
      }

      return { synopsis, author: null, artist: null, genres, status };
    },

    async fetchChapters(mangaSlug: string): Promise<ChapterResult[]> {
      if (!MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }

      const parsed = fromMangaPillSlug(mangaSlug);
      if (!parsed) {
        throw new Error('Invalid MangaPill slug format');
      }

      const url = `${BASE_URL}/manga/${parsed.id}/${parsed.slug}`;
      const html = await fetchHtml(url);
      if (!html) {
        throw new Error('Failed to fetch manga page');
      }

      const seen = new Set<string>();
      const entries: ChapterResult[] = [];

      CHAPTER_LINK_RE.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = CHAPTER_LINK_RE.exec(html)) !== null) {
        const chapterIdSlug = match[1];
        const num = match[3];
        const slug = toChapterSlug(chapterIdSlug, match[2], num);

        if (seen.has(slug)) continue;
        seen.add(slug);

        entries.push({
          slug,
          label: `Chapter ${num}`,
          type: 'chapter',
          number: parseFloat(num),
          mangaSlug,
          source: 'mangapill',
        });
      }

      entries.sort((a, b) => a.number - b.number);
      return entries;
    },

    async fetchChapter(mangaSlug: string, chapterSlug: string): Promise<ChapterDetailResult> {
      if (!MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }
      if (!CHAPTER_SLUG_RE.test(chapterSlug)) {
        throw new Error('Invalid chapter slug format');
      }

      const chapterPath = parseChapterSlug(chapterSlug);
      if (!chapterPath) {
        throw new Error('Invalid chapter slug format');
      }

      const url = `${BASE_URL}/chapters/${chapterPath}`;
      const html = await fetchHtml(url);
      if (!html) {
        throw new Error('Failed to fetch chapter page');
      }

      // Extract images
      const images: string[] = [];
      CHAPTER_IMG_RE.lastIndex = 0;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = CHAPTER_IMG_RE.exec(html)) !== null) {
        images.push(imgMatch[1].trim());
      }

      if (images.length === 0) {
        throw new Error('No images found on chapter page');
      }

      // Extract prev/next navigation (convert / to -- for URL-safe slugs)
      const prevMatch = html.match(NAV_PREV_RE);
      const prevSlug = prevMatch ? prevMatch[1].replace('/', '--') : null;

      const nextMatch = html.match(NAV_NEXT_RE);
      const nextSlug = nextMatch ? nextMatch[1].replace('/', '--') : null;

      // Extract title
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      const title = titleMatch
        ? titleMatch[1].replace(/ - Mangapill$/, '').trim()
        : `Chapter`;

      return { images, prevSlug, nextSlug, title, mangaSlug, source: 'mangapill' };
    },
  };
}
