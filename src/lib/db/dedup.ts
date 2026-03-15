import type { MangaSourceResult, SourceId } from '@/lib/sources/types';

const SOURCE_PRIORITY: Record<SourceId, number> = {
  mangadex: 4,
};

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function deduplicateMangas(
  items: MangaSourceResult[],
  chapterCounts?: Map<string, number>,
): MangaSourceResult[] {
  const groups = new Map<string, MangaSourceResult>();
  for (const item of items) {
    const key = `${item.language}::${normalizeTitle(item.title)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, item);
      continue;
    }
    const existingScore = chapterCounts?.get(existing.slug) ?? 0;
    const itemScore = chapterCounts?.get(item.slug) ?? 0;
    if (
      itemScore > existingScore ||
      (itemScore === existingScore &&
        SOURCE_PRIORITY[item.source] > SOURCE_PRIORITY[existing.source])
    ) {
      groups.set(key, item);
    }
  }
  return [...groups.values()];
}

export function deduplicateLatest(items: MangaSourceResult[]): MangaSourceResult[] {
  const groups = new Map<string, MangaSourceResult>();
  for (const item of items) {
    const key = `${item.language}::${normalizeTitle(item.title)}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, item);
      continue;
    }
    const itemTs = item.updatedAt ?? 0;
    const existingTs = existing.updatedAt ?? 0;
    if (
      itemTs > existingTs ||
      (itemTs === existingTs && SOURCE_PRIORITY[item.source] > SOURCE_PRIORITY[existing.source])
    ) {
      groups.set(key, item);
    }
  }
  return [...groups.values()];
}
