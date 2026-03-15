/** Base64url encode (RFC 4648 §5, no padding). */
export function encodeBase64Url(url: string): string {
  const b64 = btoa(url);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url decode. */
export function decodeBase64Url(encoded: string): string {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return atob(b64);
}

export function buildProxyImageUrl(originalUrl: string): string {
  if (!originalUrl) return '';
  return `/api/img/${encodeBase64Url(originalUrl)}`;
}
