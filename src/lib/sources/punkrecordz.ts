import type {
  MangaSource,
  MangaSourceResult,
  ChapterResult,
  ChapterDetailResult,
} from './types';

const GRAPHQL_URL = 'https://api.punkrecordz.com/graphql';
const IMAGE_CDN = 'https://api.punkrecordz.com/images/webp';
const SITE_URL = 'https://punkrecordz.com';

const MANGA_SLUG_RE = /^pr-[a-zA-Z0-9-]+$/;
const CHAPTER_SLUG_RE = /^\d+(?:\.\d+)?$/;

function toPrSlug(slug: string): string {
  return `pr-${slug}`;
}

function fromPrSlug(prSlug: string): string | null {
  const match = prSlug.match(/^pr-(.+)$/);
  return match ? match[1] : null;
}

function imageUrl(uuid: string): string {
  // Strip extension from uuid if present, then add .webp
  return `${IMAGE_CDN}/${uuid}.webp`;
}

async function graphql<T>(query: string): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': SITE_URL,
    },
    body: JSON.stringify({ query }),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }
  return json.data as T;
}

interface RscPage {
  colored: string | null;
  original: string;
}

interface RscChapter {
  id: string;
  number: number;
  name: string | null;
  pages: RscPage[];
  nextChapter: { number: number; manga: { slug: string } } | null;
}

function parseChapterFromRsc(html: string): RscChapter | null {
  // Extract all RSC streaming chunks and concatenate
  const chunks: string[] = [];
  const chunkRe = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs;
  let m: RegExpExecArray | null;
  while ((m = chunkRe.exec(html)) !== null) {
    // Unescape the JSON-encoded string
    chunks.push(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  const full = chunks.join('');

  // Find the chapter data block
  const idx = full.indexOf('"chapter":{');
  if (idx === -1) return null;

  // Extract the chapter JSON — find the matching brace
  const start = idx + '"chapter":'.length;
  let depth = 0;
  let end = start;
  for (let i = start; i < full.length; i++) {
    if (full[i] === '{' || full[i] === '[') depth++;
    else if (full[i] === '}' || full[i] === ']') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }

  try {
    return JSON.parse(full.substring(start, end));
  } catch {
    return null;
  }
}

export function createPunkRecordzSource(): MangaSource {
  return {
    id: 'punkrecordz',
    language: 'fr',
    allowedImageHosts: ['api.punkrecordz.com'],

    async fetchMangaList(): Promise<MangaSourceResult[]> {
      const data = await graphql<{
        mangas: { id: string; name: string; slug: string; thumb: string; published: boolean }[];
      }>('{ mangas { id name slug thumb published } }');

      return data.mangas
        .filter(m => m.published)
        .map(m => ({
          slug: toPrSlug(m.slug),
          title: m.name,
          coverUrl: imageUrl(m.thumb),
          source: 'punkrecordz' as const,
          language: 'fr' as const,
        }));
    },

    async fetchChapters(mangaSlug: string): Promise<ChapterResult[]> {
      if (!MANGA_SLUG_RE.test(mangaSlug)) {
        throw new Error('Invalid manga slug format');
      }

      const sourceSlug = fromPrSlug(mangaSlug);
      if (!sourceSlug) throw new Error('Invalid Punk Records slug format');

      const data = await graphql<{
        chapters: { id: string; number: number; name: string | null; manga: { slug: string } }[];
      }>('{ chapters { id number name manga { slug } } }');

      const entries: ChapterResult[] = data.chapters
        .filter(ch => ch.manga.slug === sourceSlug)
        .map(ch => ({
          slug: String(ch.number),
          label: ch.name || `Chapitre ${ch.number}`,
          type: 'chapter' as const,
          number: ch.number,
          mangaSlug,
          source: 'punkrecordz' as const,
        }));

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

      const sourceSlug = fromPrSlug(mangaSlug);
      if (!sourceSlug) throw new Error('Invalid Punk Records slug format');

      const url = `${SITE_URL}/mangas/${sourceSlug}/${chapterSlug}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        next: { revalidate: 3600 },
      });
      if (!res.ok) throw new Error(`Failed to fetch chapter page: ${res.status}`);
      const html = await res.text();

      const chapter = parseChapterFromRsc(html);
      if (!chapter || chapter.pages.length === 0) {
        throw new Error('No images found on chapter page');
      }

      const images = chapter.pages.map(p => imageUrl(p.colored ?? p.original));
      const chapterNum = parseFloat(chapterSlug);
      const nextSlug = chapter.nextChapter ? String(chapter.nextChapter.number) : null;
      const prevSlug = chapterNum > 1 ? String(chapterNum - 1) : null;

      return {
        images,
        prevSlug,
        nextSlug,
        title: chapter.name || `Chapitre ${chapterSlug}`,
        mangaSlug,
        source: 'punkrecordz',
      };
    },
  };
}
