import { NextRequest, NextResponse } from "next/server";
import { isValidUuid } from "@/lib/progress/store";
import { writeLibrary, addToLibrary, removeFromLibrary, toggleFavorite } from "@/lib/user/store";
import { enqueueArchive } from '@/lib/archive';

const SLUG_RE = /^[\w][\w.-]*$/;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    if (!isValidUuid(userId)) {
      return NextResponse.json({ error: "Invalid userId format" }, { status: 400 });
    }

    const body = await request.json();
    if (!Array.isArray(body.slugs) || !body.slugs.every((s: unknown) => typeof s === "string" && SLUG_RE.test(s))) {
      return NextResponse.json({ error: "slugs must be an array of valid slug strings" }, { status: 400 });
    }

    await writeLibrary(userId, body.slugs);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Library write error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    if (!isValidUuid(userId)) {
      return NextResponse.json({ error: "Invalid userId format" }, { status: 400 });
    }

    const body = await request.json();
    const { action, mangaSlug } = body;

    if (action !== "add" && action !== "remove" && action !== "favorite" && action !== "unfavorite") {
      return NextResponse.json({ error: "action must be 'add', 'remove', 'favorite', or 'unfavorite'" }, { status: 400 });
    }
    if (typeof mangaSlug !== "string" || !SLUG_RE.test(mangaSlug)) {
      return NextResponse.json({ error: "Invalid mangaSlug format" }, { status: 400 });
    }

    if (action === "add") {
      await addToLibrary(userId, mangaSlug);
      enqueueArchive(mangaSlug).catch(err => console.error('[archive] Enqueue failed:', err));
    } else if (action === "remove") {
      await removeFromLibrary(userId, mangaSlug);
    } else {
      await toggleFavorite(userId, mangaSlug, action === "favorite");
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Library patch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
