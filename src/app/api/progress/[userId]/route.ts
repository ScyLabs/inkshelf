import { NextRequest, NextResponse } from "next/server";
import {
  isValidUuid,
  readProgress,
  writeProgress,
  mergeProgress,
  getUserMeta,
} from "@/lib/progress/store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;

    if (!isValidUuid(userId)) {
      return NextResponse.json(
        { error: "Invalid userId format" },
        { status: 400 },
      );
    }

    const progress = await readProgress(userId);
    const meta = await getUserMeta(userId);
    return NextResponse.json({ progress, lastUseAt: meta?.lastUseAt ?? null });
  } catch (err) {
    console.error("Progress read error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
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
    if (!body.progress || typeof body.progress !== "object" || Array.isArray(body.progress)) {
      return NextResponse.json(
        { error: "Missing or invalid progress object" },
        { status: 400 },
      );
    }

    const existing = await readProgress(userId);
    const merged = mergeProgress(existing, body.progress);
    await writeProgress(userId, merged);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Progress write error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
