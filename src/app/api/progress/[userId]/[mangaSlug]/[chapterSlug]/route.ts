import { NextRequest, NextResponse } from "next/server";
import { isValidUuid, upsertEntry } from "@/lib/progress/store";

const SLUG_RE = /^[\w][\w.-]*$/;

function sanitizeUpdate(raw: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  if (typeof raw.currentPage === 'number') safe.currentPage = raw.currentPage;
  if (typeof raw.totalPages === 'number') safe.totalPages = raw.totalPages;
  if (typeof raw.scrollPercent === 'number') safe.scrollPercent = raw.scrollPercent;
  if (typeof raw.lastReadAt === 'number') safe.lastReadAt = raw.lastReadAt;
  if (typeof raw.completed === 'boolean') safe.completed = raw.completed;
  return safe;
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ userId: string; mangaSlug: string; chapterSlug: string }>;
  },
) {
  try {
    const { userId, mangaSlug, chapterSlug } = await params;

    if (!isValidUuid(userId)) {
      return NextResponse.json(
        { error: "Invalid userId format" },
        { status: 400 },
      );
    }

    if (!SLUG_RE.test(mangaSlug) || !SLUG_RE.test(chapterSlug)) {
      return NextResponse.json(
        { error: "Invalid slug format" },
        { status: 400 },
      );
    }

    const raw = await request.json();
    const update = sanitizeUpdate(raw);
    const key = `${mangaSlug}/${chapterSlug}`;

    await upsertEntry(userId, key, {
      ...update,
      mangaSlug,
      chapterSlug,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Progress upsert error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
