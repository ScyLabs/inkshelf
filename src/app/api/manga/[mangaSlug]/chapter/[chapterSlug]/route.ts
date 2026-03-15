import { NextRequest, NextResponse } from "next/server";
import { resolveSourceFromMangaSlug } from "@/lib/sources";
import { getCachedChapterDetail, upsertChapterDetail } from "@/lib/db/cache";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mangaSlug: string; chapterSlug: string }> },
) {
  try {
    const { mangaSlug, chapterSlug } = await params;

    const source = resolveSourceFromMangaSlug(mangaSlug);
    if (!source) {
      const cached = await getCachedChapterDetail(mangaSlug, chapterSlug);
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

    try {
      const result = await source.fetchChapter(mangaSlug, chapterSlug);
      await upsertChapterDetail(mangaSlug, chapterSlug, result);

      return NextResponse.json(result, {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    } catch (scrapeErr) {
      const cached = await getCachedChapterDetail(mangaSlug, chapterSlug);
      if (cached) {
        console.warn(`[chapter-detail] Scrape failed for ${mangaSlug}/${chapterSlug}, returning stored data`);
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
