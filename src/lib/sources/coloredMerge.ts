import type { ChapterResult } from './types';

/**
 * Merge B&W and colored chapter lists, preferring colored chapters.
 *
 * Algorithm:
 * 1. Index colored chapters by number in a Map
 * 2. Iterate B&W chapters — replace with colored when a match exists
 * 3. Keep B&W chapters that have no colored counterpart
 * 4. Rewrite mangaSlug on colored entries to targetMangaSlug (so they appear under the primary manga)
 * 5. Sort by number ascending
 *
 * @param bwChapters - Chapters from the primary (B&W) manga entry
 * @param coloredChapters - Chapters from the colored manga entry
 * @param targetMangaSlug - The primary manga slug to assign on all returned entries
 */
export function mergeWithColoredChapters(
  bwChapters: ChapterResult[],
  coloredChapters: ChapterResult[],
  targetMangaSlug: string,
): ChapterResult[] {
  if (coloredChapters.length === 0) {
    return [...bwChapters].sort((a, b) => a.number - b.number);
  }

  const coloredByNumber = new Map<number, ChapterResult>();
  for (const ch of coloredChapters) {
    coloredByNumber.set(ch.number, ch);
  }

  const merged: ChapterResult[] = [];

  for (const bw of bwChapters) {
    const colored = coloredByNumber.get(bw.number);
    if (colored) {
      merged.push({ ...colored, mangaSlug: targetMangaSlug });
      coloredByNumber.delete(bw.number);
    } else {
      merged.push(bw);
    }
  }

  // Include any colored-only chapters that had no B&W counterpart
  for (const extra of coloredByNumber.values()) {
    merged.push({ ...extra, mangaSlug: targetMangaSlug });
  }

  merged.sort((a, b) => a.number - b.number);
  return merged;
}
