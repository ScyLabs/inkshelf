import { NextRequest, NextResponse } from "next/server";
import { getSourcesWithLatestUpdates } from "@/lib/sources";
import { getCachedLatest, upsertLatest } from "@/lib/db/cache";
import { deduplicateLatest } from "@/lib/db/dedup";
import type { MangaSourceResult } from "@/lib/sources/types";

const VALID_LANGS = ['fr', 'en'] as const;
const LATEST_PAGES = 3;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const langParam = request.nextUrl.searchParams.get("lang");
    const typeParam = request.nextUrl.searchParams.get("type") ?? 'updates';

    let sources = getSourcesWithLatestUpdates();

    if (langParam) {
      if (!VALID_LANGS.includes(langParam as typeof VALID_LANGS[number])) {
        return NextResponse.json({ error: "Unknown language" }, { status: 400 });
      }
      sources = sources.filter((s) => s.language === langParam);
    }

    if (sources.length === 0) {
      return NextResponse.json([], {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      });
    }

    const allResults: MangaSourceResult[] = [];

    for (const s of sources) {
      try {
        const settled = await Promise.allSettled(
          Array.from({ length: LATEST_PAGES }, (_, i) =>
            s.fetchLatestUpdates!(i + 1),
          ),
        );
        const sourceResults: MangaSourceResult[] = [];
        for (const result of settled) {
          if (result.status === 'fulfilled' && result.value.length > 0) {
            sourceResults.push(...result.value);
          }
        }
        // Deduplicate within source (same manga can appear on multiple pages)
        const deduped = [...new Map(sourceResults.map((r) => [r.slug, r])).values()];
        if (deduped.length > 0) {
          await upsertLatest(deduped);
          allResults.push(...deduped);
        } else {
          // Scrape returned empty — fallback to stored data
          const cached = await getCachedLatest(s.id, s.language);
          if (cached) allResults.push(...cached);
        }
      } catch {
        // Source completely failed — fallback to stored data
        const cached = await getCachedLatest(s.id, s.language);
        if (cached) allResults.push(...cached);
      }
    }

    const dedupedResults = deduplicateLatest(allResults);
    dedupedResults.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    let finalResults = dedupedResults;
    if (typeParam === 'new') {
      const mostRecent = dedupedResults[0]?.updatedAt ?? 0;
      const sevenDays = 7 * 24 * 3600;
      finalResults = dedupedResults.filter(r => (r.updatedAt ?? 0) >= mostRecent - sevenDays);
      if (finalResults.length < 10) {
        const thirtyDays = 30 * 24 * 3600;
        finalResults = dedupedResults.filter(r => (r.updatedAt ?? 0) >= mostRecent - thirtyDays);
      }
    }

    return NextResponse.json(finalResults, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("Latest manga error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
