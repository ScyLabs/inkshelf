import { NextRequest, NextResponse } from "next/server";
import { isValidUuid } from "@/lib/progress/store";
import { readSettings, writeSettings, DEFAULT_SETTINGS } from "@/lib/user/store";
import type { AppSettings, ReadingMode, Language } from "@/types";

const VALID_READING_MODES: ReadingMode[] = ["longstrip", "paged"];
const VALID_LANGUAGES: Language[] = ["fr", "en"];

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
    const current = (await readSettings(userId)) ?? DEFAULT_SETTINGS;

    const merged: AppSettings = { ...current };

    if (body.readingMode !== undefined) {
      if (!VALID_READING_MODES.includes(body.readingMode)) {
        return NextResponse.json({ error: "Invalid readingMode" }, { status: 400 });
      }
      merged.readingMode = body.readingMode;
    }

    if (body.prefetchCount !== undefined) {
      if (typeof body.prefetchCount !== "number" || !Number.isFinite(body.prefetchCount) || body.prefetchCount < 0 || body.prefetchCount > 20) {
        return NextResponse.json({ error: "Invalid prefetchCount" }, { status: 400 });
      }
      merged.prefetchCount = body.prefetchCount;
    }

    if (body.autoNextChapter !== undefined) {
      if (typeof body.autoNextChapter !== "boolean") {
        return NextResponse.json({ error: "Invalid autoNextChapter" }, { status: 400 });
      }
      merged.autoNextChapter = body.autoNextChapter;
    }

    if (body.language !== undefined) {
      if (!VALID_LANGUAGES.includes(body.language)) {
        return NextResponse.json({ error: "Invalid language" }, { status: 400 });
      }
      merged.language = body.language;
    }

    await writeSettings(userId, merged);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Settings write error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
