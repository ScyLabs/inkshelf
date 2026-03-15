import { NextRequest, NextResponse } from "next/server";
import { searchMangas, getChapterCounts } from "@/lib/db/cache";
import { deduplicateMangas } from "@/lib/db/dedup";

const VALID_LANGS = ['fr', 'en'] as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    const lang = request.nextUrl.searchParams.get("lang");

    if (!q) {
      return NextResponse.json([]);
    }

    if (q.length > 200) {
      return NextResponse.json({ error: "Query too long" }, { status: 400 });
    }

    let language: string | undefined;
    if (lang) {
      if (!VALID_LANGS.includes(lang as typeof VALID_LANGS[number])) {
        return NextResponse.json({ error: "Unknown language" }, { status: 400 });
      }
      language = lang;
    }

    const results = await searchMangas(q, language);
    const counts = await getChapterCounts(results.map(r => r.slug));
    const deduped = deduplicateMangas(results, counts);

    return NextResponse.json(deduped, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    console.error("Manga search error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
