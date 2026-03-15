import { NextRequest, NextResponse } from "next/server";
import { isValidUuid, batchMarkCompleted } from "@/lib/progress/store";

const SLUG_RE = /^[\w][\w.-]*$/;

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ userId: string }>;
  },
) {
  try {
    const { userId } = await params;

    if (!isValidUuid(userId)) {
      return NextResponse.json(
        { error: "Invalid userId format" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { mangaSlug, chapterSlugs } = body;

    if (typeof mangaSlug !== "string" || !SLUG_RE.test(mangaSlug)) {
      return NextResponse.json(
        { error: "Invalid mangaSlug format" },
        { status: 400 },
      );
    }

    if (
      !Array.isArray(chapterSlugs) ||
      chapterSlugs.length === 0 ||
      chapterSlugs.length > 2000
    ) {
      return NextResponse.json(
        { error: "chapterSlugs must be a non-empty array with at most 2000 items" },
        { status: 400 },
      );
    }

    for (const slug of chapterSlugs) {
      if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
        return NextResponse.json(
          { error: "Invalid chapterSlug format" },
          { status: 400 },
        );
      }
    }

    await batchMarkCompleted(userId, mangaSlug, chapterSlugs);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Batch mark completed error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
