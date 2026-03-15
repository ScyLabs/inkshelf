import { describe, it, expect } from 'vitest';
import { resolveSourceFromMangaSlug, getSource, getSourcesWithLatestUpdates, getSourceIds } from '../index';

describe('sources/index', () => {
  describe('resolveSourceFromMangaSlug', () => {
    it('resolves scanvf slugs (no prefix)', () => {
      const source = resolveSourceFromMangaSlug('one_piece');
      expect(source).not.toBeNull();
      expect(source!.id).toBe('scanvf');
    });

    it('resolves mangapill slugs (mp- prefix)', () => {
      const source = resolveSourceFromMangaSlug('mp-one-piece');
      expect(source).not.toBeNull();
      expect(source!.id).toBe('mangapill');
    });

    it('resolves mangadex slugs (md- prefix)', () => {
      const source = resolveSourceFromMangaSlug('md-some-manga');
      expect(source).not.toBeNull();
      expect(source!.id).toBe('mangadex');
    });

    it('resolves mgeko slugs (mgk- prefix)', () => {
      const source = resolveSourceFromMangaSlug('mgk-solo-leveling');
      expect(source).not.toBeNull();
      expect(source!.id).toBe('mgeko');
    });

    it('resolves harimanga slugs (hm- prefix)', () => {
      const source = resolveSourceFromMangaSlug('hm-one-piece');
      expect(source).not.toBeNull();
      expect(source!.id).toBe('harimanga');
    });

    it('resolves punkrecordz slugs (pr- prefix)', () => {
      const source = resolveSourceFromMangaSlug('pr-one-piece');
      expect(source).not.toBeNull();
      expect(source!.id).toBe('punkrecordz');
    });

    it('returns null for invalid slugs', () => {
      expect(resolveSourceFromMangaSlug('$$invalid$$')).toBeNull();
    });
  });

  describe('getSourceIds', () => {
    it('includes all 6 sources', () => {
      const ids = getSourceIds();
      expect(ids).toContain('scanvf');
      expect(ids).toContain('mangapill');
      expect(ids).toContain('mangadex');
      expect(ids).toContain('mgeko');
      expect(ids).toContain('harimanga');
      expect(ids).toContain('punkrecordz');
      expect(ids).toHaveLength(6);
    });
  });

  describe('getSource', () => {
    it('returns mgeko source with correct properties', () => {
      const source = getSource('mgeko');
      expect(source.id).toBe('mgeko');
      expect(source.language).toBe('en');
      expect(source.allowedImageHosts).toContain('imgsrv4.com');
    });

    it('returns harimanga source with correct properties', () => {
      const source = getSource('harimanga');
      expect(source.id).toBe('harimanga');
      expect(source.language).toBe('en');
      expect(source.allowedImageHosts).toContain('harimanga.me');
    });
  });

  describe('getSourcesWithLatestUpdates', () => {
    it('returns sources that implement fetchLatestUpdates', () => {
      const sources = getSourcesWithLatestUpdates();
      expect(sources.length).toBeGreaterThanOrEqual(4);
      const ids = sources.map((s) => s.id);
      expect(ids).toContain('mgeko');
      expect(ids).toContain('harimanga');
      expect(ids).toContain('mangadex');
      expect(ids).toContain('scanvf');
    });

    it('all returned sources have fetchLatestUpdates as a function', () => {
      const sources = getSourcesWithLatestUpdates();
      for (const source of sources) {
        expect(typeof source.fetchLatestUpdates).toBe('function');
      }
    });
  });
});
