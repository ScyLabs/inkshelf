import type {
  MangaSource,
  MangaSourceResult,
  MangaInfo,
  ChapterResult,
  ChapterDetailResult,
} from './types';

const BASE_URL = 'https://harimanga.me';
const MAX_PAGES = 999;

// Cover: <a href="https://harimanga.me/manga/{slug}/" title="{title}"><img src="{coverUrl}">
const MANGA_CARD_RE =
  /<a\s+href="https:\/\/harimanga\.me\/manga\/([^"]+)\/"\s+title="([^"]+)"[^>]*>\s*<img[^>]+src="([^"]+)"/g;

// Title fallback: <h3 class="h5"><a href="https://harimanga.me/manga/{slug}/">{title}</a></h3>
const MANGA_TITLE_RE =
  /<h3\s+class="h5">\s*<a\s+href="https:\/\/harimanga\.me\/manga\/([^"]+)\/"[^>]*>([^<]+)<\/a>/g;

// Chapter links: <a href="https://harimanga.me/manga/{slug}/chapter-{num}/">Chapter {num}</a>
const CHAPTER_LINK_RE =
  /href="https:\/\/harimanga\.me\/manga\/[^"]+\/(chapter-(\d+(?:\.\d+)?))\/"/g;

// Reader images: <img class="wp-manga-chapter-img" src="{url}"> or data-src for lazy loading
const CHAPTER_IMG_RE =
  /<img[^>]+class="wp-manga-chapter-img"[^>]+(?:data-src|src)="([^"]+)"|<img[^>]+(?:data-src|src)="([^"]+)"[^>]+class="wp-manga-chapter-img"/g;

// Navigation (handle both class-before-href and href-before-class)
const NAV_PREV_RE = /(?:class="[^"]*prev_page[^"]*"[^>]+href|href)="https:\/\/harimanga\.me\/manga\/[^"]+\/(chapter-[^"]+)\/"[^>]*class="[^"]*prev_page|class="[^"]*prev_page[^"]*"[^>]+href="https:\/\/harimanga\.me\/manga\/[^"]+\/(chapter-[^"]+)\/"/;
const NAV_NEXT_RE = /(?:class="[^"]*next_page[^"]*"[^>]+href|href)="https:\/\/harimanga\.me\/manga\/[^"]+\/(chapter-[^"]+)\/"[^>]*class="[^"]*next_page|class="[^"]*next_page[^"]*"[^>]+href="https:\/\/harimanga\.me\/manga\/[^"]+\/(chapter-[^"]+)\/"/;

const MANGA_SLUG_RE = /^hm-[a-zA-Z0-9-]+$/;
const CHAPTER_SLUG_RE = /^chapter-\d+(?:\.\d+)?$/;

// Manga info regex patterns (WordPress Madara theme)
const HM_SYNOPSIS_RE = /class="description-summary">\s*<div class="summary__content[^"]*">([\s\S]*?)<\/div>/;
const HM_AUTHOR_RE = /<h5>\s*Author\(s\)\s*<\/h5>\s*<\/div>\s*<div class="summary-content">\s*<div class="author-content">\s*(?:<a[^>]*>)?([^<]+)/;
const HM_ARTIST_RE = /<h5>\s*Artist\(s\)\s*<\/h5>\s*<\/div>\s*<div class="summary-content">\s*<div class="artist-content">\s*(?:<a[^>]*>)?([^<]+)/;
const HM_STATUS_RE = /<h5>\s*Status\s*<\/h5>\s*<\/div>\s*<div class="summary-content">\s*([^<\n]+)/;
const HM_GENRES_SECTION_RE = /<div class="genres-content">([\s\S]*?)<\/div>/;
const HM_GENRE_LINK_RE = /rel="tag"[^>]*>([^<]+)<\/a>/g;

/** Parse "X minutes ago", "X hours ago", "X days ago" etc. into epoch seconds */
function parseAgoText(text: string, now: number): number | null {
  const m = text.match(/^(\d+)\s+(second|minute|min|hour|day|week|month|year)s?\s+ago$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const multipliers: Record<string, number> = {
    second: 1, minute: 60, min: 60, hour: 3600,
    day: 86400, week: 604800, month: 2592000, year: 31536000,
  };
  const mult = multipliers[unit];
  if (!mult) return null;
  return now - n * mult;
}

function toHarimangaSlug(rawSlug: string): string {
  return `hm-${rawSlug}`;
}

function fromHarimangaSlug(slug: string): string | null {
  const match = slug.match(/^hm-(.+)$/);
  return match ? match[1] : null;
}

async function fetchHtml(url: string): Promise<string | null> {
  const response = await fetch(url, {
    next: { revalidate: 3600 },
    headers: {
      'Referer': 'https://harimanga.me/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });
  if (!response.ok) return null;
  return response.text();
}

export function createHarimangaSource(): MangaSource {
  return {
    id: 'harimanga',
    language: 'en',
    allowedImageHosts: ['*.manimg24.com', 'harimanga.me'],

    async fetchMangaList(): Promise<MangaSourceResult[]> {
      const seen = new Set<string>();
      const mangas: MangaSourceResult[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        let html: string | null;
        try {
          html = await fetchHtml(
            `${BASE_URL}/manga/?m_orderby=latest&page=${page}`,
          );
        } catch (err) {
          console.error(`[harimanga] Page ${page} failed (keeping ${mangas.length} mangas):`, err);
          break;
        }
        if (!html) break;

        // Extract cover images + titles from card links (title attr on <a>)
        const covers = new Map<string, { title: string; coverUrl: string }>();
        MANGA_CARD_RE.lastIndex = 0;
        let cardMatch: RegExpExecArray | null;
        while ((cardMatch = MANGA_CARD_RE.exec(html)) !== null) {
          covers.set(cardMatch[1], {
            title: cardMatch[2].trim(),
            coverUrl: cardMatch[3],
          });
        }

        // Also try h3 titles as fallback
        MANGA_TITLE_RE.lastIndex = 0;
        let titleMatch: RegExpExecArray | null;
        const titles = new Map<string, string>();
        while ((titleMatch = MANGA_TITLE_RE.exec(html)) !== null) {
          titles.set(titleMatch[1], titleMatch[2].trim());
        }

        // Merge: prefer card data, fallback to h3 titles
        const allSlugs = new Set([...covers.keys(), ...titles.keys()]);
        let foundAny = false;

        for (const rawSlug of allSlugs) {
          if (seen.has(rawSlug)) continue;
          seen.add(rawSlug);
          foundAny = true;

          const cardData = covers.get(rawSlug);
          const title = cardData?.title || titles.get(rawSlug) || rawSlug;
          const coverUrl = cardData?.coverUrl || '';

          mangas.push({
            slug: toHarimangaSlug(rawSlug),
            title,
            coverUrl,
            source: 'harimanga',
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
      const rawSlug = fromHarimangaSlug(mangaSlug);
      if (!rawSlug) {
        throw new Error('Invalid harimanga slug format');
      }

      const url = `${BASE_URL}/manga/${rawSlug}/`;
      const html = await fetchHtml(url);
      if (!html) {
        throw new Error('Failed to fetch manga page');
      }

      // Synopsis
      const synMatch = html.match(HM_SYNOPSIS_RE);
      let synopsis: string | null = null;
      if (synMatch) {
        synopsis = synMatch[1]
          .replace(/<\/p>\s*<p>/gi, '\n')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
          .replace(/&amp;/g, '&')
          .replace(/&nbsp;/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim() || null;
      }

      // Author
      const authorMatch = html.match(HM_AUTHOR_RE);
      const author = authorMatch ? authorMatch[1].trim() || null : null;

      // Artist
      const artistMatch = html.match(HM_ARTIST_RE);
      const artist = artistMatch ? artistMatch[1].trim() || null : null;

      // Genres
      const genres: string[] = [];
      const genreSection = html.match(HM_GENRES_SECTION_RE);
      if (genreSection) {
        HM_GENRE_LINK_RE.lastIndex = 0;
        let gm: RegExpExecArray | null;
        while ((gm = HM_GENRE_LINK_RE.exec(genreSection[1])) !== null) {
          const g = gm[1].trim();
          if (g) genres.push(g);
        }
      }

      // Status
      const statusMatch = html.match(HM_STATUS_RE);
      let status: string | null = null;
      if (statusMatch) {
        const raw = statusMatch[1].trim().toLowerCase();
        if (raw.includes('ongoing')) status = 'ongoing';
        else if (raw.includes('completed')) status = 'completed';
        else if (raw.includes('hiatus') || raw.includes('on hold')) status = 'hiatus';
        else if (raw.includes('cancel')) status = 'cancelled';
        else status = raw || null;
      }

      return { synopsis, author, artist, genres, status };
    },

    async fetchLatestUpdates(page = 1): Promise<MangaSourceResult[]> {
      const html = await fetchHtml(
        `${BASE_URL}/manga/?m_orderby=latest&page=${page}`,
      );
      if (!html) return [];

      const seen = new Set<string>();
      const mangas: MangaSourceResult[] = [];

      // Extract card data
      MANGA_CARD_RE.lastIndex = 0;
      let cardMatch: RegExpExecArray | null;
      const covers = new Map<string, { title: string; coverUrl: string }>();
      while ((cardMatch = MANGA_CARD_RE.exec(html)) !== null) {
        covers.set(cardMatch[1], {
          title: cardMatch[2].trim(),
          coverUrl: cardMatch[3],
        });
      }

      // h3 titles
      MANGA_TITLE_RE.lastIndex = 0;
      let titleMatch: RegExpExecArray | null;
      const titles = new Map<string, string>();
      while ((titleMatch = MANGA_TITLE_RE.exec(html)) !== null) {
        titles.set(titleMatch[1], titleMatch[2].trim());
      }

      // Extract latest chapter numbers from listing
      const CHAPTER_IN_LISTING_RE = /href="https:\/\/harimanga\.me\/manga\/([^"]+)\/(chapter-(\d+(?:\.\d+)?))\/"/g;
      const chapterMap = new Map<string, number>();
      CHAPTER_IN_LISTING_RE.lastIndex = 0;
      let chMatch: RegExpExecArray | null;
      while ((chMatch = CHAPTER_IN_LISTING_RE.exec(html)) !== null) {
        const rawSlug = chMatch[1];
        const num = parseFloat(chMatch[3]);
        const existing = chapterMap.get(rawSlug);
        if (!existing || num > existing) {
          chapterMap.set(rawSlug, num);
        }
      }

      const allSlugs = new Set([...covers.keys(), ...titles.keys()]);

      for (const rawSlug of allSlugs) {
        if (seen.has(rawSlug)) continue;
        seen.add(rawSlug);

        const cardData = covers.get(rawSlug);
        const title = cardData?.title || titles.get(rawSlug) || rawSlug;
        const coverUrl = cardData?.coverUrl || '';

        mangas.push({
          slug: toHarimangaSlug(rawSlug),
          title,
          coverUrl,
          source: 'harimanga',
          language: 'en',
        });
      }

      // Extract real timestamps from post-on spans:
      // <span class="post-on font-meta"><a href=".../{slug}/chapter-{num}/" title="22 minutes ago" ...>
      const TIME_RE = /href="https:\/\/harimanga\.me\/manga\/([^"]+)\/chapter-[^"]*"\s+title="([^"]+)"\s+class="c-new-tag"/g;
      const timeMap = new Map<string, number>();
      const now = Math.floor(Date.now() / 1000);
      TIME_RE.lastIndex = 0;
      let timeMatch: RegExpExecArray | null;
      while ((timeMatch = TIME_RE.exec(html)) !== null) {
        const rawSlug = timeMatch[1];
        if (timeMap.has(rawSlug)) continue; // keep first (most recent) chapter's time
        const agoText = timeMatch[2].trim().toLowerCase();
        const parsed = parseAgoText(agoText, now);
        if (parsed !== null) {
          timeMap.set(rawSlug, parsed);
        }
      }

      for (let i = 0; i < mangas.length; i++) {
        const rawSlug = fromHarimangaSlug(mangas[i].slug);
        if (rawSlug) {
          const chNum = chapterMap.get(rawSlug);
          if (chNum !== undefined) {
            mangas[i].latestChapter = `Chapter ${chNum}`;
          }
          const ts = timeMap.get(rawSlug);
          if (ts !== undefined) {
            mangas[i].updatedAt = ts;
          }
        }
      }

      return mangas;
    },

    async fetchChapters(mangaSlug: string): Promise<ChapterResult[]> {
      if (!MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }

      const rawSlug = fromHarimangaSlug(mangaSlug);
      if (!rawSlug) {
        throw new Error('Invalid harimanga slug format');
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
        const num = match[2];

        if (seen.has(slug)) continue;
        seen.add(slug);

        entries.push({
          slug,
          label: `Chapter ${num}`,
          type: 'chapter',
          number: parseFloat(num),
          mangaSlug,
          source: 'harimanga',
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

      const rawSlug = fromHarimangaSlug(mangaSlug);
      if (!rawSlug) {
        throw new Error('Invalid harimanga slug format');
      }

      const url = `${BASE_URL}/manga/${rawSlug}/${chapterSlug}/`;
      const html = await fetchHtml(url);
      if (!html) {
        throw new Error('Failed to fetch chapter page');
      }

      // Extract images (capture group 1 or 2 depending on attribute order)
      const images: string[] = [];
      CHAPTER_IMG_RE.lastIndex = 0;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = CHAPTER_IMG_RE.exec(html)) !== null) {
        const imgUrl = (imgMatch[1] || imgMatch[2]).trim();
        if (imgUrl) images.push(imgUrl);
      }

      if (images.length === 0) {
        throw new Error('No images found on chapter page');
      }

      // Extract prev/next navigation (capture group 1 or 2 depending on attribute order)
      const prevMatch = html.match(NAV_PREV_RE);
      const prevSlug = prevMatch ? (prevMatch[1] || prevMatch[2]) : null;

      const nextMatch = html.match(NAV_NEXT_RE);
      const nextSlug = nextMatch ? (nextMatch[1] || nextMatch[2]) : null;

      // Extract title
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      const title = titleMatch
        ? titleMatch[1].replace(/\s*[-|].*$/, '').trim()
        : 'Chapter';

      return { images, prevSlug, nextSlug, title, mangaSlug, source: 'harimanga' };
    },
  };
}
