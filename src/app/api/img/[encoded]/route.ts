import { NextResponse } from "next/server";
import { decodeBase64Url } from "@/services/imageProxy";
import { getAllAllowedImageHosts } from "@/lib/sources";
import { lookupLocalImage } from '@/lib/archive';
import { readFile } from 'node:fs/promises';

const REFERER_MAP: Record<string, string> = {
  'cdn.readdetectiveconan.com': 'https://mangapill.com/',
  'www.scan-vf.net': 'https://www.scan-vf.net/',
  'scan-vf.net': 'https://www.scan-vf.net/',
  'sushiscan.net': 'https://sushiscan.net/',
  'www.sushiscan.net': 'https://sushiscan.net/',
  'imgsrv4.com': 'https://www.mgeko.cc/',
  'h5.manimg24.com': 'https://harimanga.me/',
  'api.punkrecordz.com': 'https://punkrecordz.com/',
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const UPSTREAM_TIMEOUT_MS = 10_000; // 10s max for upstream fetch

interface CacheEntry {
  body: ArrayBuffer;
  contentType: string;
  expiresAt: number;
}

const IMAGE_CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_ENTRIES = 200;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastSweep = Date.now();

function sweepExpired() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, entry] of IMAGE_CACHE) {
    if (entry.expiresAt <= now) {
      IMAGE_CACHE.delete(key);
    }
  }
}

function evictOldest() {
  const oldest = IMAGE_CACHE.keys().next().value;
  if (oldest !== undefined) {
    IMAGE_CACHE.delete(oldest);
  }
}

function buildResponseHeaders(contentType: string, cacheStatus: 'HIT' | 'MISS' | 'LOCAL'): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    'Access-Control-Allow-Origin': '*',
    'X-Cache': cacheStatus,
  };
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ encoded: string }> },
) {
  try {
    const { encoded } = await params;

    if (!encoded) {
      return NextResponse.json(
        { error: "Missing encoded URL" },
        { status: 400 },
      );
    }

    let imageUrl: string;
    try {
      imageUrl = decodeBase64Url(encoded);
    } catch {
      return NextResponse.json(
        { error: "Invalid encoded URL" },
        { status: 400 },
      );
    }

    // Check local archive first
    const localPath = await lookupLocalImage(imageUrl);
    if (localPath) {
      try {
        const buffer = await readFile(localPath);
        const ext = localPath.split('.').pop() ?? 'jpg';
        const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
        return new Response(buffer, { headers: buildResponseHeaders(mimeMap[ext] ?? 'image/jpeg', 'LOCAL') });
      } catch (err) { console.error('[img] Local archive read failed, falling through:', err); }
    }

    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return NextResponse.json({ error: "Invalid URL protocol" }, { status: 400 });
    }

    const allowedHosts = getAllAllowedImageHosts();
    const isAllowed = allowedHosts.some((host) =>
      host.startsWith('*.')
        ? parsed.hostname.endsWith(host.slice(1))
        : parsed.hostname === host,
    );
    if (!isAllowed) {
      return NextResponse.json(
        { error: "Host not in whitelist" },
        { status: 403 },
      );
    }

    // Lazy sweep expired entries
    sweepExpired();

    // Check in-memory cache
    const cached = IMAGE_CACHE.get(imageUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return new Response(cached.body, { headers: buildResponseHeaders(cached.contentType, 'HIT') });
    }

    // Cache miss: fetch upstream
    const referer = REFERER_MAP[parsed.hostname] ?? `${parsed.protocol}//${parsed.hostname}/`;

    const upstream = await fetch(imageUrl, {
      headers: {
        'Referer': referer,
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image" },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (contentType && !contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: "Upstream returned non-image content" },
        { status: 502 },
      );
    }

    const body = await upstream.arrayBuffer();

    // Store in cache
    if (IMAGE_CACHE.size >= MAX_CACHE_ENTRIES) {
      evictOldest();
    }
    IMAGE_CACHE.set(imageUrl, {
      body,
      contentType,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return new Response(body, { headers: buildResponseHeaders(contentType, 'MISS') });
  } catch (err) {
    console.error("Image proxy error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
