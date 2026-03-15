import { NextRequest, NextResponse } from "next/server";
import { isValidUuid, getUserMeta } from "@/lib/progress/store";

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
    const meta = await getUserMeta(userId);
    return NextResponse.json({ lastUseAt: meta?.lastUseAt ?? null });
  } catch (err) {
    console.error("Sync check error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
