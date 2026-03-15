import { NextRequest, NextResponse } from "next/server";
import { resolveSourceFromMangaSlug } from "@/lib/sources";
import { getCachedMangaInfo, upsertMangaInfo } from "@/lib/db/cache";
import type { MangaInfo } from "@/lib/sources/types";

const NULL_INFO: MangaInfo = {
  synopsis: null,
  author: null,
  artist: null,
  genres: [],
  status: null,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mangaSlug: string }> },
) {
  try {
    const { mangaSlug } = await params;

    const source = resolveSourceFromMangaSlug(mangaSlug);
    if (!source) {
      const cached = await getCachedMangaInfo(mangaSlug);
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

    if (typeof source.fetchMangaInfo === "function") {
      try {
        const info = await source.fetchMangaInfo(mangaSlug);
        await upsertMangaInfo(mangaSlug, info);
        return NextResponse.json(info, {
          headers: {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
          },
        });
      } catch (scrapeErr) {
        console.warn(`[manga-info] Fetch failed for ${mangaSlug}, falling back to cache`, scrapeErr);
        const cached = await getCachedMangaInfo(mangaSlug);
        if (cached) {
          return NextResponse.json(cached, {
            headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600" },
          });
        }
        throw scrapeErr;
      }
    }

    const cached = await getCachedMangaInfo(mangaSlug);
    return NextResponse.json(cached ?? NULL_INFO, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("Manga info error:", err);
    const message = err instanceof Error ? err.message : "";
    if (message.includes("Invalid")) {
      return NextResponse.json({ error: "Invalid manga slug" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
