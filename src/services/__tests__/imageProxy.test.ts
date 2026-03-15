import { describe, it, expect } from 'vitest';
import { buildProxyImageUrl, encodeBase64Url, decodeBase64Url } from '../imageProxy';

describe('encodeBase64Url / decodeBase64Url', () => {
  it('roundtrips a real manga URL', () => {
    const url = 'https://www.scan-vf.net/uploads/manga/one_piece/chapters/chapitre-1171/01.webp';
    expect(decodeBase64Url(encodeBase64Url(url))).toBe(url);
  });

  it('produces only URL-safe characters (no +, /, =)', () => {
    const url = 'https://cdn.example.com/path?a=1&b=2';
    const encoded = encodeBase64Url(url);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('roundtrips URLs with special characters (spaces, &, ?, =)', () => {
    const url = 'https://example.com/manga page?chapter=1&lang=fr';
    expect(decodeBase64Url(encodeBase64Url(url))).toBe(url);
  });

  it('roundtrips an empty string', () => {
    expect(decodeBase64Url(encodeBase64Url(''))).toBe('');
  });
});

describe('buildProxyImageUrl', () => {
  it('returns /api/img/<encoded> format', () => {
    const url = 'https://cdn.example.com/img1.jpg';
    const result = buildProxyImageUrl(url);
    expect(result).toMatch(/^\/api\/img\/[A-Za-z0-9_-]+$/);
  });

  it('encoded segment decodes back to original URL', () => {
    const url = 'https://cdn.example.com/img1.jpg';
    const result = buildProxyImageUrl(url);
    const encoded = result.replace('/api/img/', '');
    expect(decodeBase64Url(encoded)).toBe(url);
  });

  it('returns empty string for empty input', () => {
    expect(buildProxyImageUrl('')).toBe('');
  });
});
