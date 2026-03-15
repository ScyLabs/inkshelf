import { NextRequest, NextResponse } from "next/server";
import { getAllSources, getSource, getSourceIds } from "@/lib/sources";
import type { SourceId } from "@/lib/sources";
import { getCachedMangas, getChapterCounts } from "@/lib/db/cache";
import { deduplicateMangas } from "@/lib/db/dedup";
import type { MangaSourceResult } from "@/lib/sources/types";

const VALID_LANGS = ['fr', 'en'] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const sourceParam = request.nextUrl.searchParams.get("source");
    const langParam = request.nextUrl.searchParams.get("lang");

    let sources = getAllSources();

    if (sourceParam) {
      if (!getSourceIds().includes(sourceParam as SourceId)) {
        return NextResponse.json({ error: "Unknown source" }, { status: 400 });
      }
      sources = [getSource(sourceParam as SourceId)];
    } else if (langParam) {
      if (!VALID_LANGS.includes(langParam as typeof VALID_LANGS[number])) {
        return NextResponse.json({ error: "Unknown language" }, { status: 400 });
      }
      sources = sources.filter((s) => s.language === langParam);
    }

    const allResults: MangaSourceResult[] = [];
    for (const s of sources) {
      const cached = await getCachedMangas(s.id, s.language);
      if (cached) {
        allResults.push(...cached);
      }
    }

    // Deduplicate across sources (skip if single source requested)
    if (!sourceParam) {
      const counts = await getChapterCounts(allResults.map(r => r.slug));
      const deduped = deduplicateMangas(allResults, counts);
      return NextResponse.json(deduped, {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    }

    return NextResponse.json(allResults, {
      headers: {
        "Cache-Control":
          "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    console.error("Manga list error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
