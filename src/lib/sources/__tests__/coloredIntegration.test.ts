import { describe, it, expect } from 'vitest';
import { getColoredCounterpart } from '../coloredMappings';
import { mergeWithColoredChapters } from '../coloredMerge';
import { resolveSourceFromMangaSlug } from '../index';
import type { ChapterResult } from '../types';

function makeCh(n: number, mangaSlug: string, prefix: string): ChapterResult {
  return {
    slug: `${prefix}-ch-${n}`,
    label: `Chapter ${n}`,
    type: 'chapter',
    number: n,
    mangaSlug,
    source: 'mangapill',
  };
}

describe('Colored chapters integration', () => {
  it('mapping resolves One Piece correctly', () => {
    const colored = getColoredCounterpart('mp-5016-one-piece');
    expect(colored).toBe('mp-3258-one-piece-digital-colored-comics');
  });

  it('returns null for manga without colored counterpart', () => {
    expect(getColoredCounterpart('mp-999-naruto')).toBeNull();
  });

  it('both B&W and colored slugs resolve to MangaPill source', () => {
    const bwSource = resolveSourceFromMangaSlug('mp-5016-one-piece');
    const colorSource = resolveSourceFromMangaSlug('mp-3258-one-piece-digital-colored-comics');
    expect(bwSource?.id).toBe('mangapill');
    expect(colorSource?.id).toBe('mangapill');
  });

  it('simulates real One Piece merge: 1130 B&W + 1065 colored', () => {
    const BW_SLUG = 'mp-5016-one-piece';
    const COLOR_SLUG = 'mp-3258-one-piece-digital-colored-comics';

    const bw = Array.from({ length: 1130 }, (_, i) => makeCh(i + 1, BW_SLUG, 'bw'));
    const colored = Array.from({ length: 1065 }, (_, i) => makeCh(i + 1, COLOR_SLUG, 'color'));

    const merged = mergeWithColoredChapters(bw, colored, BW_SLUG);

    // Total should be 1130 (1065 colored + 65 B&W beyond colored range)
    expect(merged).toHaveLength(1130);

    // First 1065 chapters should be from colored source
    expect(merged.slice(0, 1065).every(c => c.slug.startsWith('color-'))).toBe(true);

    // Chapters 1066-1130 should be from B&W source
    expect(merged.slice(1065).every(c => c.slug.startsWith('bw-'))).toBe(true);

    // All mangaSlug should be the primary (B&W) slug
    expect(merged.every(c => c.mangaSlug === BW_SLUG)).toBe(true);

    // Result should be sorted by number ascending
    expect(merged.every((c, i) => i === 0 || c.number >= merged[i - 1].number)).toBe(true);
  });
});
