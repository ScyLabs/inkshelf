import type {
  MangaSource,
  MangaSourceResult,
  MangaInfo,
  ChapterResult,
  ChapterDetailResult,
} from './types';
import { fetchWithFlare } from './flaresolverr';

const BASE_URL = 'https://www.mgeko.cc';
const MAX_PAGES = 999;

// Card: <article class="comic-card">...<a href="/manga/{slug}/">...<img src="https://imgsrv4.com/avatar/288x412/...">
const MANGA_CARD_RE =
  /<a\s+href="\/manga\/([^"]+)\/"[^>]*>\s*<img\s+src="(https:\/\/imgsrv4\.com\/[^"]+)"/g;

// Title: <h3 class="comic-card__title"><a href="/manga/{slug}/">{title}</a></h3>
const MANGA_TITLE_RE =
  /<h3\s+class="comic-card__title">\s*<a\s+href="\/manga\/([^"]+)\/"[^>]*>([^<]+)<\/a>/g;

// Chapter link: <a href="/reader/en/{chapterSlug}/">
const CHAPTER_LINK_RE =
  /href="\/reader\/en\/(([^"]+)-chapter-(\d+(?:\.\d+)?)-eng-li)\/">/g;

// Chapter images: <img src="https://imgsrv4.com/mg1/fastcdn/cdn_mangaraw/...">
const CHAPTER_IMG_RE =
  /<img[^>]+src="(https:\/\/imgsrv4\.com\/[^"]+\.(jpg|png|webp))"/g;

// Navigation
const NAV_PREV_RE = /href="\/reader\/en\/([^"]+)\/"\s+class="[^"]*prevchap/;
const NAV_NEXT_RE = /href="\/reader\/en\/([^"]+)\/"\s+class="[^"]*nextchap/;

const MANGA_SLUG_RE = /^mgk-[a-zA-Z0-9._-]+$/;
const CHAPTER_SLUG_RE = /^[a-zA-Z0-9-]+-chapter-\d+(?:\.\d+)?-eng-li$/;

// Manga info regex patterns
const MGK_DESCRIPTION_RE = /<p class="description">([\s\S]*?)<\/p>/;
const MGK_AUTHOR_RE = /itemprop="author">([^<]+)<\/span>/;
const MGK_STATUS_RE = /<strong class="(ongoing|completed|hiatus|cancelled)">([^<]+)<\/strong>/;
const MGK_CATEGORIES_RE = /<strong>Categories<\/strong>\s*<ul>([\s\S]*?)<\/ul>/;
const MGK_GENRE_LINK_RE = /class="property-item">\s*([^<]+?)\s*<\/a>/g;

function toMgekoSlug(rawSlug: string): string {
  return `mgk-${rawSlug}`;
}

function fromMgekoSlug(slug: string): string | null {
  const match = slug.match(/^mgk-(.+)$/);
  return match ? match[1] : null;
}

async function fetchHtml(url: string): Promise<string | null> {
  // mgeko is a SPA — direct fetch only returns an empty shell.
  // Must use FlareSolverr (full browser render) to get actual content.
  // Try direct fetch first as a fast path (in case site changes)
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://www.mgeko.cc/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (response.ok) {
      const text = await response.text();
      // Only accept if we see actual manga content (not just a shell)
      if (text.includes('comic-card__title') && text.includes('/manga/')) {
        return text;
      }
    }
  } catch {
    // fall through
  }

  // Use FlareSolverr with full JS rendering
  console.log(`[mgeko] Using FlareSolverr for ${url}`);
  return fetchWithFlare(url, { maxTimeout: 30000 });
}

export function createMgekoSource(): MangaSource {
  return {
    id: 'mgeko',
    language: 'en',
    allowedImageHosts: ['imgsrv4.com'],

    async fetchMangaList(): Promise<MangaSourceResult[]> {
      const seen = new Set<string>();
      const mangas: MangaSourceResult[] = [];

      let consecutiveFailures = 0;
      for (let page = 1; page <= MAX_PAGES; page++) {
        let html: string | null;
        try {
          html = await fetchHtml(`${BASE_URL}/browse-comics/?page=${page}`);
        } catch (err) {
          console.error(`[mgeko] Page ${page} failed (keeping ${mangas.length} mangas):`, err);
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            console.error(`[mgeko] 3 consecutive failures, stopping at page ${page}`);
            break;
          }
          continue;
        }
        if (!html) {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            console.error(`[mgeko] 3 consecutive null pages, stopping at page ${page}`);
            break;
          }
          continue;
        }
        consecutiveFailures = 0;

        // Extract cover images keyed by slug
        const covers = new Map<string, string>();
        MANGA_CARD_RE.lastIndex = 0;
        let cardMatch: RegExpExecArray | null;
        while ((cardMatch = MANGA_CARD_RE.exec(html)) !== null) {
          covers.set(cardMatch[1], cardMatch[2]);
        }

        // Extract titles and build manga list
        MANGA_TITLE_RE.lastIndex = 0;
        let titleMatch: RegExpExecArray | null;
        let foundAny = false;

        while ((titleMatch = MANGA_TITLE_RE.exec(html)) !== null) {
          const rawSlug = titleMatch[1];
          if (seen.has(rawSlug)) continue;
          seen.add(rawSlug);
          foundAny = true;

          const coverUrl = covers.get(rawSlug) || '';

          mangas.push({
            slug: toMgekoSlug(rawSlug),
            title: titleMatch[2].trim(),
            coverUrl,
            source: 'mgeko',
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
      const rawSlug = fromMgekoSlug(mangaSlug);
      if (!rawSlug) {
        throw new Error('Invalid mgeko slug format');
      }

      const url = `${BASE_URL}/manga/${rawSlug}/`;
      const html = await fetchHtml(url);
      if (!html) {
        throw new Error('Failed to fetch manga page');
      }

      // Synopsis: strip boilerplate before "The Summary is" if present
      let synopsis: string | null = null;
      const descMatch = html.match(MGK_DESCRIPTION_RE);
      if (descMatch) {
        let raw = descMatch[1];
        const summaryIdx = raw.indexOf('The Summary is');
        if (summaryIdx !== -1) {
          raw = raw.substring(summaryIdx + 'The Summary is'.length);
        }
        synopsis = raw
          .replace(/<\/?\s*br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/\n{3,}/g, '\n\n')
          .trim() || null;
      }

      const authorMatch = html.match(MGK_AUTHOR_RE);
      let author: string | null = null;
      if (authorMatch) {
        const val = authorMatch[1].trim();
        author = val.toLowerCase() === 'updating' ? null : val || null;
      }

      const genres: string[] = [];
      const catSection = html.match(MGK_CATEGORIES_RE);
      if (catSection) {
        MGK_GENRE_LINK_RE.lastIndex = 0;
        let gm: RegExpExecArray | null;
        while ((gm = MGK_GENRE_LINK_RE.exec(catSection[1])) !== null) {
          const g = gm[1].trim();
          if (g) genres.push(g);
        }
      }

      const statusMatch = html.match(MGK_STATUS_RE);
      const status = statusMatch ? statusMatch[1].toLowerCase() : null;

      return { synopsis, author, artist: null, genres, status };
    },

    async fetchLatestUpdates(page = 1): Promise<MangaSourceResult[]> {
      const html = await fetchHtml(`${BASE_URL}/browse-comics/?page=${page}`);
      if (!html) return [];

      const seen = new Set<string>();
      const mangas: MangaSourceResult[] = [];

      // Extract covers
      const covers = new Map<string, string>();
      MANGA_CARD_RE.lastIndex = 0;
      let cardMatch: RegExpExecArray | null;
      while ((cardMatch = MANGA_CARD_RE.exec(html)) !== null) {
        covers.set(cardMatch[1], cardMatch[2]);
      }

      // Extract titles
      MANGA_TITLE_RE.lastIndex = 0;
      let titleMatch: RegExpExecArray | null;

      while ((titleMatch = MANGA_TITLE_RE.exec(html)) !== null) {
        const rawSlug = titleMatch[1];
        if (seen.has(rawSlug)) continue;
        seen.add(rawSlug);

        const coverUrl = covers.get(rawSlug) || '';

        mangas.push({
          slug: toMgekoSlug(rawSlug),
          title: titleMatch[2].trim(),
          coverUrl,
          source: 'mgeko',
          language: 'en',
        });
      }

      // Extract latest chapter numbers from listing
      const CHAPTER_IN_LISTING_RE = /href="\/reader\/en\/([a-zA-Z0-9._-]+)-chapter-(\d+(?:\.\d+)?)-eng-li\/"/g;
      const chapterMap = new Map<string, number>();
      CHAPTER_IN_LISTING_RE.lastIndex = 0;
      let chMatch: RegExpExecArray | null;
      while ((chMatch = CHAPTER_IN_LISTING_RE.exec(html)) !== null) {
        const slugPrefix = chMatch[1];
        const num = parseFloat(chMatch[2]);
        const existing = chapterMap.get(slugPrefix);
        if (!existing || num > existing) {
          chapterMap.set(slugPrefix, num);
        }
      }

      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < mangas.length; i++) {
        const rawSlug = fromMgekoSlug(mangas[i].slug);
        if (rawSlug) {
          const chNum = chapterMap.get(rawSlug);
          if (chNum !== undefined) {
            mangas[i].latestChapter = `Chapter ${chNum}`;
          }
        }
        mangas[i].updatedAt = now - i * 120;
      }

      return mangas;
    },

    async fetchChapters(mangaSlug: string): Promise<ChapterResult[]> {
      if (!MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }

      const rawSlug = fromMgekoSlug(mangaSlug);
      if (!rawSlug) {
        throw new Error('Invalid mgeko slug format');
      }

      const url = `${BASE_URL}/manga/${rawSlug}/`;
      const html = await fetchHtml(url);
      if (!html) {
        throw new Error('Failed to fetch manga page');
      }

      const seen = new Set<string>();
      const entries: ChapterResult[] = [];

      CHAPTER_LINK_RE.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = CHAPTER_LINK_RE.exec(html)) !== null) {
        const slug = match[1];
        const num = match[3];

        if (seen.has(slug)) continue;
        seen.add(slug);

        entries.push({
          slug,
          label: `Chapter ${num}`,
          type: 'chapter',
          number: parseFloat(num),
          mangaSlug,
          source: 'mgeko',
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

      const url = `${BASE_URL}/reader/en/${chapterSlug}/`;
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

      // Extract prev/next navigation
      const prevMatch = html.match(NAV_PREV_RE);
      const prevSlug = prevMatch ? prevMatch[1] : null;

      const nextMatch = html.match(NAV_NEXT_RE);
      const nextSlug = nextMatch ? nextMatch[1] : null;

      // Extract title
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      const title = titleMatch
        ? titleMatch[1].replace(/\s*[-|].*$/, '').trim()
        : 'Chapter';

      return { images, prevSlug, nextSlug, title, mangaSlug, source: 'mgeko' };
    },
  };
}
