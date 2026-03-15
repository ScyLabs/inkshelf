const PATH_CACHE_MAX = 10_000;
const pathCache = new Map<string, string | null>();

export function pathCacheGet(key: string): string | null | undefined {
  if (!pathCache.has(key)) return undefined;
  return pathCache.get(key) ?? null;
}

export function pathCacheSet(key: string, value: string | null): void {
  if (pathCache.size >= PATH_CACHE_MAX) {
    const oldest = pathCache.keys().next().value;
    if (oldest !== undefined) {
      pathCache.delete(oldest);
    }
  }
  pathCache.set(key, value);
}

export function pathCacheInvalidate(key: string): void {
  pathCache.delete(key);
}
