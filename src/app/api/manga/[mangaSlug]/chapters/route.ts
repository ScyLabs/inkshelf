import { NextRequest, NextResponse } from "next/server";
import { resolveSourceFromMangaSlug } from "@/lib/sources";
import { getCachedChapters, upsertChapters } from "@/lib/db/cache";
import { getColoredCounterpart } from "@/lib/sources/coloredMappings";
import { mergeWithColoredChapters } from "@/lib/sources/coloredMerge";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mangaSlug: string }> },
) {
  try {
    const { mangaSlug } = await params;

    const source = resolveSourceFromMangaSlug(mangaSlug);
    if (!source) {
      // No source — return stored data if available
      const cached = await getCachedChapters(mangaSlug);
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

    // Always attempt fresh scrape
    try {
      // Fetch B&W and colored chapters in parallel if a colored counterpart exists
      // Only merge if both sources share the same language (never mix fr/en)
      const coloredSlug = getColoredCounterpart(mangaSlug);
      const coloredSourceCandidate = coloredSlug ? resolveSourceFromMangaSlug(coloredSlug) : null;
      const coloredSource = coloredSourceCandidate?.language === source.language
        ? coloredSourceCandidate
        : null;

      const [entries, coloredEntries] = await Promise.all([
        source.fetchChapters(mangaSlug),
        coloredSource
          ? coloredSource.fetchChapters(coloredSlug!).catch(async (err) => {
              console.warn(`[chapters] Colored fetch failed for ${mangaSlug}:`, err);
              // Fallback to previously cached colored chapters
              return await getCachedChapters(coloredSlug!) ?? [];
            })
          : Promise.resolve([]),
      ]);

      const finalEntries = coloredEntries.length > 0
        ? mergeWithColoredChapters(entries, coloredEntries, mangaSlug)
        : entries;

      await upsertChapters(mangaSlug, finalEntries);

      return NextResponse.json(finalEntries, {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    } catch (scrapeErr) {
      // Source failed — fallback to stored data
      const cached = await getCachedChapters(mangaSlug);
      if (cached) {
        console.warn(`[chapters] Scrape failed for ${mangaSlug}, returning stored data`);
        return NextResponse.json(cached, {
          headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" },
        });
      }
      throw scrapeErr;
    }
  } catch (err) {
    console.error("Catalogue error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("Invalid") ? 400 : message.includes("Failed") ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
