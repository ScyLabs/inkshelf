/**
 * Format manga and chapter slugs into human-readable display names.
 * Handles all source prefixes: mp- (mangapill), md- (mangadex), mgk- (mgeko), hm- (harimanga), none (scanvf).
 */

/** Strip source prefix + numeric ID from manga slug, then title-case */
export function formatMangaSlug(slug: string): string {
  let clean = slug;

  // MangaPill: mp-{id}-{name}
  const mpMatch = clean.match(/^mp-\d+-(.+)$/);
  if (mpMatch) clean = mpMatch[1];
  // MangaDex: md-{uuid} — UUID is not readable, just show "MangaDex manga"
  else if (/^md-[0-9a-f-]{36}$/.test(clean)) return 'MangaDex manga';
  // Mgeko: mgk-{name}
  else if (clean.startsWith('mgk-')) clean = clean.slice(4);
  // Harimanga: hm-{name}
  else if (clean.startsWith('hm-')) clean = clean.slice(3);

  return titleCase(clean.replace(/[-_]/g, ' '));
}

/** Extract chapter number from slug and format nicely */
export function formatChapterSlug(slug: string): string {
  // ScanVF: chapitre-1130
  const frMatch = slug.match(/^chapitre-(\d+(?:\.\d+)?)$/);
  if (frMatch) return `Chapitre ${frMatch[1]}`;

  // MangaPill / Mgeko: {name}-chapter-{num} or {name}-chapter-{num}-eng-li
  const mpMatch = slug.match(/-chapter-(\d+(?:\.\d+)?)(?:-eng-li)?$/);
  if (mpMatch) return `Chapter ${mpMatch[1]}`;

  // Harimanga: chapter-{num}
  const hmMatch = slug.match(/^chapter-(\d+(?:\.\d+)?)$/);
  if (hmMatch) return `Chapter ${hmMatch[1]}`;

  // MangaDex: UUID — not readable
  if (/^[0-9a-f-]{36}$/.test(slug)) return 'Chapter';

  // Generic fallback: look for any chapter-like number
  const genMatch = slug.match(/chapter[- ]?(\d+(?:\.\d+)?)/i);
  if (genMatch) return `Chapter ${genMatch[1]}`;

  return titleCase(slug.replace(/[-_]/g, ' '));
}

/** Format an epoch timestamp as a French relative date */
export function formatRelativeDate(epoch: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - epoch;

  if (diff < 0) return "Aujourd'hui";
  if (diff < 3600) return `Il y a ${Math.max(1, Math.floor(diff / 60))}min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 172800) return 'Hier';
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)}j`;
  if (diff < 2592000) return `Il y a ${Math.floor(diff / 604800)} sem`;
  return `Il y a ${Math.floor(diff / 2592000)} mois`;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
