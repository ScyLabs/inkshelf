import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';

const WHITELIST_PATH =
  process.env.ARCHIVE_WHITELIST_PATH ?? '/data/archive-whitelist.json';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

interface ArchiveWhitelist {
  enabled: boolean;
  whitelisted: string[];
}

function loadWhitelist(): ArchiveWhitelist {
  try {
    return JSON.parse(readFileSync(WHITELIST_PATH, 'utf-8'));
  } catch {
    return { enabled: false, whitelisted: [] };
  }
}

function saveWhitelist(wl: ArchiveWhitelist): void {
  writeFileSync(WHITELIST_PATH, JSON.stringify(wl, null, 2) + '\n', 'utf-8');
}

function checkAuth(req: NextRequest): boolean {
  if (!ADMIN_TOKEN) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${ADMIN_TOKEN}`;
}

// GET – return current whitelist
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(loadWhitelist());
}

// POST – add a slug
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const slug = body?.slug;
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'Missing "slug" in body' }, { status: 400 });
  }
  const wl = loadWhitelist();
  if (!wl.whitelisted.includes(slug)) {
    wl.whitelisted.push(slug);
    saveWhitelist(wl);
  }
  return NextResponse.json({ ok: true, whitelisted: wl.whitelisted });
}

// DELETE – remove a slug
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const slug = body?.slug;
  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'Missing "slug" in body' }, { status: 400 });
  }
  const wl = loadWhitelist();
  wl.whitelisted = wl.whitelisted.filter((s) => s !== slug);
  saveWhitelist(wl);
  return NextResponse.json({ ok: true, whitelisted: wl.whitelisted });
}
