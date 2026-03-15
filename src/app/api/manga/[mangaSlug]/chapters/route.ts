import { NextRequest, NextResponse } from "next/server";
import { resolveSourceFromMangaSlug } from "@/lib/sources";
import { getCachedChapters, upsertChapters } from "@/lib/db/cache";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mangaSlug: string }> },
) {
  try {
    const { mangaSlug } = await params;

    const source = resolveSourceFromMangaSlug(mangaSlug);
    if (!source) {
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

    try {
      const entries = await source.fetchChapters(mangaSlug);
      await upsertChapters(mangaSlug, entries);

      return NextResponse.json(entries, {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      });
    } catch (scrapeErr) {
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
