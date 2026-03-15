import { NextResponse } from "next/server";
import { getScraperStatusFromDb } from "@/lib/db/cache";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await getScraperStatusFromDb());
}
