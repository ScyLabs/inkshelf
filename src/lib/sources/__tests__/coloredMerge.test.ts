import { describe, it, expect } from 'vitest';
import { mergeWithColoredChapters } from '../coloredMerge';
import type { ChapterResult } from '../types';

function ch(number: number, mangaSlug: string, label?: string): ChapterResult {
  return {
    slug: `${mangaSlug}-chapter-${number}`,
    label: label ?? `Chapter ${number}`,
    type: 'chapter',
    number,
    mangaSlug,
    source: 'mangapill',
  };
}

const BW = 'mp-5016-one-piece';
const COLOR = 'mp-3258-one-piece-digital-colored-comics';

describe('mergeWithColoredChapters', () => {
  it('returns B&W sorted when no colored chapters', () => {
    const bw = [ch(1, BW), ch(2, BW), ch(3, BW)];
    const result = mergeWithColoredChapters(bw, [], BW);
    expect(result.map(r => r.number)).toEqual([1, 2, 3]);
  });

  it('sorts unsorted B&W chapters even when no colored chapters are provided', () => {
    const bw = [ch(3, BW), ch(1, BW), ch(2, BW)];
    const result = mergeWithColoredChapters(bw, [], BW);
    expect(result.map(r => r.number)).toEqual([1, 2, 3]);
  });

  it('replaces B&W with colored at matching chapter numbers', () => {
    const bw = [ch(1, BW), ch(2, BW), ch(3, BW)];
    const colored = [ch(1, COLOR), ch(2, COLOR)];
    const result = mergeWithColoredChapters(bw, colored, BW);

    expect(result).toHaveLength(3);
    // Chapters 1 and 2 should come from colored, with mangaSlug rewritten
    expect(result[0].slug).toBe(`${COLOR}-chapter-1`);
    expect(result[0].mangaSlug).toBe(BW);
    expect(result[1].slug).toBe(`${COLOR}-chapter-2`);
    expect(result[1].mangaSlug).toBe(BW);
    // Chapter 3 stays B&W
    expect(result[2].slug).toBe(`${BW}-chapter-3`);
    expect(result[2].mangaSlug).toBe(BW);
  });

  it('keeps extra B&W chapters beyond colored range', () => {
    const bw = [ch(1, BW), ch(2, BW), ch(3, BW), ch(4, BW), ch(5, BW)];
    const colored = [ch(1, COLOR), ch(2, COLOR), ch(3, COLOR)];
    const result = mergeWithColoredChapters(bw, colored, BW);

    expect(result).toHaveLength(5);
    // First 3 are colored
    expect(result[0].slug).toContain(COLOR);
    expect(result[1].slug).toContain(COLOR);
    expect(result[2].slug).toContain(COLOR);
    // Last 2 are B&W
    expect(result[3].slug).toContain(BW);
    expect(result[4].slug).toContain(BW);
  });

  it('includes colored-only chapters that have no B&W counterpart', () => {
    const bw = [ch(1, BW), ch(3, BW)];
    const colored = [ch(1, COLOR), ch(2, COLOR), ch(3, COLOR)];
    const result = mergeWithColoredChapters(bw, colored, BW);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.number)).toEqual([1, 2, 3]);
    // All should have the target mangaSlug
    expect(result.every(r => r.mangaSlug === BW)).toBe(true);
  });

  it('rewrites mangaSlug to targetMangaSlug on colored entries', () => {
    const bw = [ch(1, BW)];
    const colored = [ch(1, COLOR)];
    const result = mergeWithColoredChapters(bw, colored, BW);

    expect(result[0].mangaSlug).toBe(BW);
    expect(result[0].slug).toBe(`${COLOR}-chapter-1`);
  });

  it('sorts result by chapter number ascending', () => {
    const bw = [ch(5, BW), ch(1, BW), ch(3, BW)];
    const colored = [ch(2, COLOR), ch(4, COLOR)];
    const result = mergeWithColoredChapters(bw, colored, BW);

    expect(result.map(r => r.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles decimal chapter numbers', () => {
    const bw = [ch(1, BW), ch(1.5, BW), ch(2, BW)];
    const colored = [ch(1, COLOR), ch(1.5, COLOR)];
    const result = mergeWithColoredChapters(bw, colored, BW);

    expect(result).toHaveLength(3);
    expect(result[0].slug).toContain(COLOR);
    expect(result[1].slug).toContain(COLOR);
    expect(result[2].slug).toContain(BW);
    expect(result.map(r => r.number)).toEqual([1, 1.5, 2]);
  });

  it('returns colored chapters (with rewritten slug) when B&W is empty', () => {
    const colored = [ch(1, COLOR), ch(2, COLOR)];
    const result = mergeWithColoredChapters([], colored, BW);

    expect(result).toHaveLength(2);
    expect(result.every(r => r.mangaSlug === BW)).toBe(true);
  });

  it('returns empty when both lists are empty', () => {
    const result = mergeWithColoredChapters([], [], BW);
    expect(result).toEqual([]);
  });
});
