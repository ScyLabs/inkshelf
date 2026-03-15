import { NextRequest, NextResponse } from "next/server";
import { resolveSourceFromMangaSlug } from "@/lib/sources";
import { getCachedChapterDetail, getCachedChapters, upsertChapterDetail } from "@/lib/db/cache";
import { getColoredCounterpart } from "@/lib/sources/coloredMappings";
import type { MangaSource } from "@/lib/sources/types";

/**
 * Extract chapter number from a chapter slug (any source format).
 * MangaPill: "1234-5678--one-piece-chapter-100" → 100
 * ScanVF:    "chapitre-122" → 122
 */
function extractChapterNumber(slug: string): number | null {
  const match = slug.match(/(?:chapter|chapitre)-(\d+(?:\.\d+)?)$/);
  return match ? parseFloat(match[1]) : null;
}

interface ColoredResolution {
  chapterSlug: string;
  fetchMangaSlug: string;
  source: MangaSource;
}

/**
 * For mangas with a colored counterpart (possibly cross-source), resolve the
 * effective chapter slug and source to use for fetching.
 *
 * Handles two cases:
 * 1. User has an old B&W slug from progress → swap to colored slug by chapter number
 * 2. User clicked a colored slug from the chapter list → detect cross-source and
 *    route to the colored source
 */
async function resolveColoredChapter(
  mangaSlug: string,
  chapterSlug: string,
): Promise<ColoredResolution | null> {
  const coloredMangaSlug = getColoredCounterpart(mangaSlug);
  if (!coloredMangaSlug) return null;

  const coloredSource = resolveSourceFromMangaSlug(coloredMangaSlug);
  if (!coloredSource) return null;

  // Never mix languages (e.g. ScanVF fr → MangaPill en)
  const primarySource = resolveSourceFromMangaSlug(mangaSlug);
  if (primarySource && coloredSource.language !== primarySource.language) return null;

  const cached = await getCachedChapters(mangaSlug);
  if (!cached) return null;

  // Case 1: exact slug match — chapter is already a colored slug from the list
  const exactMatch = cached.find(c => c.slug === chapterSlug && c.source === coloredSource.id);
  if (exactMatch) {
    return { chapterSlug, fetchMangaSlug: coloredMangaSlug, source: coloredSource };
  }

  // Case 2: old B&W slug — find the colored equivalent by chapter number
  const num = extractChapterNumber(chapterSlug);
  if (num === null) return null;

  const coloredEntry = cached.find(c => c.number === num && c.source === coloredSource.id);
  if (coloredEntry) {
    return { chapterSlug: coloredEntry.slug, fetchMangaSlug: coloredMangaSlug, source: coloredSource };
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mangaSlug: string; chapterSlug: string }> },
) {
  try {
    const { mangaSlug, chapterSlug: rawChapterSlug } = await params;

    const primarySource = resolveSourceFromMangaSlug(mangaSlug);
    if (!primarySource) {
      const cached = await getCachedChapterDetail(mangaSlug, rawChapterSlug);
      if (cached) {
        return NextResponse.json(cached, {
          headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" },
        });
      }
      return NextResponse.json(
        { error: "Unknown source for manga slug" },
        { status: 400 },
      );
    }

    // Resolve colored chapter (handles same-source and cross-source)
    const colored = await resolveColoredChapter(mangaSlug, rawChapterSlug);
    const effectiveSlug = colored?.chapterSlug ?? rawChapterSlug;
    const fetchMangaSlug = colored?.fetchMangaSlug ?? mangaSlug;
    const fetchSource = colored?.source ?? primarySource;

    // Always attempt fresh scrape
    try {
      const result = await fetchSource.fetchChapter(fetchMangaSlug, effectiveSlug);

      // Rewrite mangaSlug in result so the client stays on the primary manga
      const clientResult = { ...result, mangaSlug };

      await upsertChapterDetail(mangaSlug, effectiveSlug, clientResult);

      return NextResponse.json(clientResult, {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    } catch (scrapeErr) {
      // Source failed — fallback to stored data (try effective slug, then original)
      const cached = await getCachedChapterDetail(mangaSlug, effectiveSlug)
        ?? (effectiveSlug !== rawChapterSlug ? await getCachedChapterDetail(mangaSlug, rawChapterSlug) : null);
      if (cached) {
        console.warn(`[chapter-detail] Scrape failed for ${mangaSlug}/${effectiveSlug}, returning stored data`);
        return NextResponse.json(cached, {
          headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" },
        });
      }
      throw scrapeErr;
    }
  } catch (err) {
    console.error("Chapter error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Invalid") ? 400
      : message.includes("No images") ? 404
      : message.includes("Failed") ? 502
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
