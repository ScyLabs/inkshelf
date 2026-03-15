/**
 * Format manga and chapter slugs into human-readable display names.
 * Handles md- (mangadex) prefix.
 */

/** Strip source prefix from manga slug, then title-case */
export function formatMangaSlug(slug: string): string {
  // MangaDex: md-{uuid} — UUID is not readable, just show "MangaDex manga"
  if (/^md-[0-9a-f-]{36}$/.test(slug)) return 'MangaDex manga';

  return titleCase(slug.replace(/[-_]/g, ' '));
}

/** Extract chapter number from slug and format nicely */
export function formatChapterSlug(slug: string): string {
  // MangaDex: UUID — not readable
  if (/^[0-9a-f-]{36}$/.test(slug)) return 'Chapter';

  // Generic fallback: look for any chapter-like number
  const genMatch = slug.match(/chapter[- ]?(\d+(?:\.\d+)?)/i);
  if (genMatch) return `Chapter ${genMatch[1]}`;

  return titleCase(slug.replace(/[-_]/g, ' '));
}

/** Format an epoch timestamp as a relative date */
export function formatRelativeDate(epoch: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - epoch;

  if (diff < 0) return 'Today';
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`;
  return `${Math.floor(diff / 2592000)}mo ago`;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
