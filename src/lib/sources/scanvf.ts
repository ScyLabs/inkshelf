import type {
  MangaSource,
  MangaSourceResult,
  MangaInfo,
  ChapterResult,
  ChapterDetailResult,
} from './types';
import { fetchWithFlare } from './flaresolverr';

const SOURCE_URL = 'https://www.scan-vf.net';
const FILTER_URL = `${SOURCE_URL}/filterList`;
const MAX_PAGES = 999;

const MANGA_TITLE_RE =
  /href="https:\/\/www\.scan-vf\.net\/([^/"]+)"\s+class="chart-title"><strong>([^<]+)<\/strong><\/a>/g;

const IMG_RE =
  /data-src='\s*(https:\/\/www\.scan-vf\.net\/uploads\/manga\/[^']+)\s*'/g;

const MANGA_SLUG_RE = /^[a-zA-Z0-9_-]+$/;
const CHAPTER_SLUG_RE = /^chapitre-\d+(\.\d+)?$/;

// Manga info regex patterns
const SYNOPSIS_RE = /<div class="well">\s*<h5>[\s\S]*?<\/h5>\s*<p>([\s\S]*?)<\/p>/;
const AUTHOR_RE = /<dt>Auteur\(s\)<\/dt>\s*<dd>\s*(?:<a[^>]*>)?([^<]+)/;
const CATEGORIES_SECTION_RE = /<dt>Cat[eé]gories<\/dt>\s*<dd>([\s\S]*?)<\/dd>/;
const GENRE_LINK_RE = /<a[^>]*>([^<]+)<\/a>/g;
const STATUS_RE = /<dt>Statut<\/dt>\s*<dd>\s*(?:<span[^>]*>)?([^<]+)/;

async function fetchPage(page: number): Promise<string | null> {
  const url = `${FILTER_URL}?page=${page}&sortBy=name&asc=true`;
  // Try direct fetch first
  try {
    const response = await fetch(url, {
      headers: {
        'Referer': 'https://www.scan-vf.net/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (response.ok) {
      const text = await response.text();
      if (!text.includes('Just a moment') && !text.includes('challenges.cloudflare.com')) {
        return text;
      }
    }
  } catch {
    // fall through
  }
  // Fallback to FlareSolverr
  console.log(`[scanvf] Using FlareSolverr for page ${page}`);
  return fetchWithFlare(url, { maxTimeout: 20000 });
}

async function fetchLatestPage(page: number): Promise<string | null> {
  const url = page === 1
    ? `${SOURCE_URL}/latest-release`
    : `${SOURCE_URL}/latest-release?page=${page}`;
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) return null;
  return response.text();
}

function buildChapterRegex(mangaSlug: string): RegExp {
  const escaped = mangaSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `href="https://www\\.scan-vf\\.net/${escaped}/(chapitre-(\\d+(?:\\.\\d+)?))"`,
    'g',
  );
}

export function createScanVfSource(): MangaSource {
  return {
    id: 'scanvf',
    language: 'fr',
    allowedImageHosts: ['www.scan-vf.net', 'scan-vf.net'],

    async fetchMangaList(): Promise<MangaSourceResult[]> {
      const seen = new Set<string>();
      const mangas: MangaSourceResult[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        let html: string | null;
        try {
          html = await fetchPage(page);
        } catch (err) {
          console.error(`[scanvf] Page ${page} failed (keeping ${mangas.length} mangas):`, err);
          break;
        }
        if (!html) break;

        let match: RegExpExecArray | null;
        let foundAny = false;

        MANGA_TITLE_RE.lastIndex = 0;
        while ((match = MANGA_TITLE_RE.exec(html)) !== null) {
          const slug = match[1];
          if (seen.has(slug)) continue;
          seen.add(slug);
          foundAny = true;

          mangas.push({
            slug,
            title: match[2].trim(),
            coverUrl: `${SOURCE_URL}/uploads/manga/${slug}/cover/cover_250x350.jpg`,
            source: 'scanvf',
            language: 'fr',
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

      const url = `${SOURCE_URL}/${mangaSlug}`;
      const response = await fetch(url, { next: { revalidate: 3600 } });
      if (!response.ok) {
        throw new Error(`Failed to fetch manga page: ${response.status}`);
      }
      const html = await response.text();

      const synopsisMatch = html.match(SYNOPSIS_RE);
      const synopsis = synopsisMatch
        ? synopsisMatch[1].replace(/<[^>]+>/g, '').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim() || null
        : null;

      const authorMatch = html.match(AUTHOR_RE);
      const author = authorMatch ? authorMatch[1].trim() || null : null;

      const genres: string[] = [];
      const catSection = html.match(CATEGORIES_SECTION_RE);
      if (catSection) {
        GENRE_LINK_RE.lastIndex = 0;
        let gm: RegExpExecArray | null;
        while ((gm = GENRE_LINK_RE.exec(catSection[1])) !== null) {
          const g = gm[1].trim();
          if (g) genres.push(g);
        }
      }

      const statusMatch = html.match(STATUS_RE);
      let status: string | null = null;
      if (statusMatch) {
        const raw = statusMatch[1].trim().toLowerCase();
        if (raw.includes('en cours')) status = 'ongoing';
        else if (raw.includes('terminé') || raw.includes('termine')) status = 'completed';
        else if (raw.includes('pause')) status = 'hiatus';
        else if (raw.includes('annulé') || raw.includes('annule')) status = 'cancelled';
        else status = raw || null;
      }

      return { synopsis, author, artist: null, genres, status };
    },

    async fetchLatestUpdates(page = 1): Promise<MangaSourceResult[]> {
      const html = await fetchLatestPage(page);
      if (!html) return [];

      const mangas: MangaSourceResult[] = [];
      const seen = new Set<string>();

      // Parse manga-item blocks from /latest-release page
      // Structure: <a href=".../slug">Title</a> ... <small ...>DD/M/YYYY</small> ... <a href=".../slug/chapitre-N">...</a>
      const ITEM_RE = /<div class="manga-item">([\s\S]*?)(?=<div class="manga-item">|<\/div>\s*<\/div>\s*<\/div>)/g;
      const LINK_RE = /href="https:\/\/www\.scan-vf\.net\/([^/"]+)">([^<]+)<\/a>/;
      const DATE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
      const CHAPTER_RE = /href="https:\/\/www\.scan-vf\.net\/[^"/]+\/chapitre-(\d+(?:\.\d+)?)"/g;

      ITEM_RE.lastIndex = 0;
      let itemMatch: RegExpExecArray | null;
      while ((itemMatch = ITEM_RE.exec(html)) !== null) {
        const block = itemMatch[1];

        const linkMatch = block.match(LINK_RE);
        if (!linkMatch) continue;

        const slug = linkMatch[1];
        if (seen.has(slug)) continue;
        seen.add(slug);

        const manga: MangaSourceResult = {
          slug,
          title: linkMatch[2].trim(),
          coverUrl: `${SOURCE_URL}/uploads/manga/${slug}/cover/cover_250x350.jpg`,
          source: 'scanvf',
          language: 'fr',
        };

        // Parse real date (DD/M/YYYY → epoch seconds)
        const dateMatch = block.match(DATE_RE);
        if (dateMatch) {
          const day = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1;
          const year = parseInt(dateMatch[3], 10);
          manga.updatedAt = Math.floor(new Date(year, month, day).getTime() / 1000);
        }

        // Extract highest chapter number
        CHAPTER_RE.lastIndex = 0;
        let chMatch: RegExpExecArray | null;
        let maxCh = -1;
        while ((chMatch = CHAPTER_RE.exec(block)) !== null) {
          const num = parseFloat(chMatch[1]);
          if (num > maxCh) maxCh = num;
        }
        if (maxCh >= 0) {
          manga.latestChapter = `Chapitre ${maxCh}`;
        }

        mangas.push(manga);
      }

      return mangas;
    },

    async fetchChapters(mangaSlug: string): Promise<ChapterResult[]> {
      if (!MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }

      const url = `${SOURCE_URL}/${mangaSlug}`;
      const response = await fetch(url, { next: { revalidate: 3600 } });
      if (!response.ok) {
        throw new Error(`Failed to fetch catalogue page: ${response.status}`);
      }

      const html = await response.text();
      const chapterRegex = buildChapterRegex(mangaSlug);

      const seen = new Set<string>();
      const entries: ChapterResult[] = [];
      let match: RegExpExecArray | null;

      while ((match = chapterRegex.exec(html)) !== null) {
        const slug = match[1];
        if (seen.has(slug)) continue;
        seen.add(slug);

        entries.push({
          slug,
          label: `Chapitre ${match[2]}`,
          type: 'chapter',
          number: parseFloat(match[2]),
          mangaSlug,
          source: 'scanvf',
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

      const url = `${SOURCE_URL}/${mangaSlug}/${chapterSlug}`;
      const response = await fetch(url, { next: { revalidate: 3600 } });
      if (!response.ok) {
        throw new Error(`Failed to fetch chapter page: ${response.status}`);
      }

      const html = await response.text();

      const images: string[] = [];
      let match: RegExpExecArray | null;

      IMG_RE.lastIndex = 0;
      while ((match = IMG_RE.exec(html)) !== null) {
        images.push(match[1].trim());
      }

      if (images.length === 0) {
        throw new Error('No images found on chapter page');
      }

      const currentNum = parseFloat(chapterSlug.replace('chapitre-', ''));
      const navRegex = buildChapterRegex(mangaSlug);

      const allChapterMatches = [...html.matchAll(navRegex)];
      const chapterNums = [...new Set(allChapterMatches.map((m) => m[2]))]
        .map((s) => parseFloat(s))
        .sort((a, b) => a - b);

      const currentIdx = chapterNums.indexOf(currentNum);
      const prevSlug =
        currentIdx > 0 ? `chapitre-${chapterNums[currentIdx - 1]}` : null;
      const nextSlug =
        currentIdx >= 0 && currentIdx < chapterNums.length - 1
          ? `chapitre-${chapterNums[currentIdx + 1]}`
          : null;

      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      const title = titleMatch
        ? titleMatch[1].trim()
        : `Chapitre ${currentNum}`;

      return { images, prevSlug, nextSlug, title, mangaSlug, source: 'scanvf' };
    },
  };
}
