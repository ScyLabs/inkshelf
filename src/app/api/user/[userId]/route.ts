import { NextRequest, NextResponse } from "next/server";
import { isValidUuid } from "@/lib/progress/store";
import { readFullUserState } from "@/lib/user/store";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { userId } = await params;
    if (!isValidUuid(userId)) {
      return NextResponse.json({ error: "Invalid userId format" }, { status: 400 });
    }
    const state = await readFullUserState(userId);
    return NextResponse.json(state);
  } catch (err) {
    console.error("User state read error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
