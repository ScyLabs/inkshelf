import { NextResponse } from 'next/server';
import { getArchiveStatus } from '@/lib/archive';

const SLUG_RE = /^[\w][\w.-]*$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mangaSlug: string }> },
) {
  try {
    const { mangaSlug } = await params;

    if (!mangaSlug || !SLUG_RE.test(mangaSlug)) {
      return NextResponse.json({ error: 'Invalid mangaSlug format' }, { status: 400 });
    }

    const status = await getArchiveStatus(mangaSlug);
    if (!status) {
      return NextResponse.json({ error: 'No archive found' }, { status: 404 });
    }

    return NextResponse.json(status, {
      headers: { 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    console.error('Archive status error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
