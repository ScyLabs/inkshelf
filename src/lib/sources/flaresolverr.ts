/**
 * FlareSolverr helper — bypasses Cloudflare challenges via a local FlareSolverr instance.
 *
 * Two modes:
 *   1. fetchWithFlare(url) — full page fetch through FlareSolverr (slow, ~15-30s)
 *   2. solveCookies(url) — solve challenge once, get cookies + userAgent for fast direct fetches
 */

const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL ?? 'http://localhost:8191/v1';

interface FlareOptions {
  maxTimeout?: number;
}

interface FlareCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
}

interface FlareSolverrResponse {
  status: string;
  message: string;
  solution?: {
    url: string;
    status: number;
    response: string;
    cookies: FlareCookie[];
    userAgent: string;
  };
}

export interface FlareSession {
  cookies: string;       // Cookie header string ready to use
  userAgent: string;
  solvedAt: number;
}

// Cache solved sessions by domain (valid ~15 min typically)
const sessionCache = new Map<string, FlareSession>();
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 min

/**
 * Solve a Cloudflare challenge and return cookies + userAgent for direct fetching.
 * Cached per domain for 10 minutes.
 */
export async function solveCookies(
  url: string,
  options: FlareOptions = {},
): Promise<FlareSession | null> {
  const { maxTimeout = 30000 } = options;
  const domain = new URL(url).hostname;

  // Check cache
  const cached = sessionCache.get(domain);
  if (cached && Date.now() - cached.solvedAt < SESSION_TTL_MS) {
    return cached;
  }

  console.log(`[flaresolverr] Solving challenge for ${domain}...`);

  try {
    const res = await fetch(FLARESOLVERR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url, maxTimeout }),
    });

    if (!res.ok) {
      console.error(`[flaresolverr] HTTP ${res.status} for ${url}`);
      return null;
    }

    const data: FlareSolverrResponse = await res.json();

    if (data.status !== 'ok' || !data.solution) {
      console.error(`[flaresolverr] Failed for ${url}: ${data.message}`);
      return null;
    }

    const cookieStr = data.solution.cookies
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const session: FlareSession = {
      cookies: cookieStr,
      userAgent: data.solution.userAgent,
      solvedAt: Date.now(),
    };

    sessionCache.set(domain, session);
    console.log(`[flaresolverr] Challenge solved for ${domain}, got ${data.solution.cookies.length} cookies`);
    return session;
  } catch (err) {
    console.error(`[flaresolverr] Error solving ${url}:`, err);
    return null;
  }
}

/**
 * Fetch a page through FlareSolverr (full proxy mode — slow).
 * Use solveCookies() + direct fetch for bulk scraping.
 */
export async function fetchWithFlare(
  url: string,
  options: FlareOptions = {},
): Promise<string | null> {
  const { maxTimeout = 15000 } = options;

  try {
    const res = await fetch(FLARESOLVERR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url, maxTimeout }),
    });

    if (!res.ok) {
      console.error(`[flaresolverr] HTTP ${res.status} for ${url}`);
      return null;
    }

    const data: FlareSolverrResponse = await res.json();

    if (data.status !== 'ok' || !data.solution) {
      console.error(`[flaresolverr] Failed for ${url}: ${data.message}`);
      return null;
    }

    if (data.solution.status >= 400) {
      console.error(`[flaresolverr] Upstream ${data.solution.status} for ${url}`);
      return null;
    }

    return data.solution.response;
  } catch (err) {
    console.error(`[flaresolverr] Error fetching ${url}:`, err);
    return null;
  }
}
