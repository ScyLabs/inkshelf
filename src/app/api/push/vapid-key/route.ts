import { NextResponse } from 'next/server';

export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY ?? '';
  if (!key) {
    return NextResponse.json({ key: '' }, { status: 503 });
  }
  return NextResponse.json(
    { key },
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}
