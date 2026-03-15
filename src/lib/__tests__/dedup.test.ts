import { describe, it, expect } from 'vitest';
import { normalizeTitle, deduplicateMangas, deduplicateLatest } from '../db/dedup';
import type { MangaSourceResult } from '@/lib/sources/types';

function manga(overrides: Partial<MangaSourceResult> & { title: string; slug: string }): MangaSourceResult {
  return {
    source: 'scanvf',
    language: 'fr',
    coverUrl: '',
    ...overrides,
  };
}

describe('normalizeTitle', () => {
  it('lowercases text', () => {
    expect(normalizeTitle('One Piece')).toBe('one piece');
  });

  it('trims whitespace', () => {
    expect(normalizeTitle('  naruto  ')).toBe('naruto');
  });

  it('removes parenthesized content', () => {
    expect(normalizeTitle('Bleach (Color Edition)')).toBe('bleach');
  });

  it('removes bracketed content', () => {
    expect(normalizeTitle('Naruto [EN]')).toBe('naruto');
  });

  it('strips special characters', () => {
    expect(normalizeTitle("Hunter x Hunter!?")).toBe('hunter x hunter');
  });

  it('preserves numbers', () => {
    expect(normalizeTitle('7 Deadly Sins')).toBe('7 deadly sins');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeTitle('One    Piece')).toBe('one piece');
  });

  it('strips diacritics', () => {
    expect(normalizeTitle('Café à la crème')).toBe('cafe a la creme');
  });
});

describe('deduplicateMangas', () => {
  it('keeps unique titles', () => {
    const items = [
      manga({ title: 'One Piece', slug: 'one-piece', source: 'scanvf' }),
      manga({ title: 'Naruto', slug: 'naruto', source: 'scanvf' }),
    ];
    const result = deduplicateMangas(items);
    expect(result).toHaveLength(2);
  });

  it('deduplicates same title and language', () => {
    const items = [
      manga({ title: 'One Piece', slug: 'one-piece', source: 'scanvf', language: 'fr' }),
      manga({ title: 'One Piece', slug: 'md-xxx', source: 'mangadex', language: 'fr' }),
    ];
    // Without chapter counts, mangadex wins by source priority
    const result = deduplicateMangas(items);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('mangadex');
  });

  it('keeps entries with different languages', () => {
    const items = [
      manga({ title: 'One Piece', slug: 'one-piece', source: 'scanvf', language: 'fr' }),
      manga({ title: 'One Piece', slug: 'mp-one-piece', source: 'mangapill', language: 'en' }),
    ];
    const result = deduplicateMangas(items);
    expect(result).toHaveLength(2);
  });

  it('prefers entry with higher chapter count', () => {
    const items = [
      manga({ title: 'One Piece', slug: 'md-xxx', source: 'mangadex', language: 'fr' }),
      manga({ title: 'One Piece', slug: 'one-piece', source: 'scanvf', language: 'fr' }),
    ];
    const counts = new Map([
      ['md-xxx', 10],
      ['one-piece', 100],
    ]);
    const result = deduplicateMangas(items, counts);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('one-piece');
  });

  it('uses source priority as tiebreaker when chapter counts are equal', () => {
    const items = [
      manga({ title: 'Bleach', slug: 'mgk-bleach', source: 'mgeko', language: 'en' }),
      manga({ title: 'Bleach', slug: 'mp-bleach', source: 'mangapill', language: 'en' }),
    ];
    const counts = new Map([
      ['mgk-bleach', 50],
      ['mp-bleach', 50],
    ]);
    const result = deduplicateMangas(items, counts);
    expect(result).toHaveLength(1);
    // mangapill (priority 2) > mgeko (priority 1)
    expect(result[0].source).toBe('mangapill');
  });
});

describe('deduplicateLatest', () => {
  it('keeps the entry with the most recent updatedAt', () => {
    const items = [
      manga({ title: 'One Piece', slug: 'one-piece', source: 'scanvf', language: 'fr', updatedAt: 1000 }),
      manga({ title: 'One Piece', slug: 'md-xxx', source: 'mangadex', language: 'fr', updatedAt: 2000 }),
    ];
    const result = deduplicateLatest(items);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('md-xxx');
  });

  it('keeps existing when it has more recent updatedAt', () => {
    const items = [
      manga({ title: 'Naruto', slug: 'md-naruto', source: 'mangadex', language: 'fr', updatedAt: 5000 }),
      manga({ title: 'Naruto', slug: 'naruto', source: 'scanvf', language: 'fr', updatedAt: 3000 }),
    ];
    const result = deduplicateLatest(items);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('md-naruto');
  });

  it('treats undefined updatedAt as 0', () => {
    const items = [
      manga({ title: 'Bleach', slug: 'bleach-old', source: 'scanvf', language: 'fr' }),
      manga({ title: 'Bleach', slug: 'bleach-new', source: 'scanvf', language: 'fr', updatedAt: 100 }),
    ];
    const result = deduplicateLatest(items);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe('bleach-new');
  });

  it('keeps entries with different languages', () => {
    const items = [
      manga({ title: 'One Piece', slug: 'one-piece', source: 'scanvf', language: 'fr', updatedAt: 1000 }),
      manga({ title: 'One Piece', slug: 'mp-one-piece', source: 'mangapill', language: 'en', updatedAt: 2000 }),
    ];
    const result = deduplicateLatest(items);
    expect(result).toHaveLength(2);
  });
});
