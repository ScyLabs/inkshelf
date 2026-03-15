/**
 * Static mapping of B&W manga slugs to their colored (Digital Colored Comics) counterparts.
 * When a manga has a colored variant, chapters from the colored version replace B&W
 * chapters at matching chapter numbers. Works cross-source (e.g. ScanVF → MangaPill colored).
 */

const COLORED_COUNTERPARTS: ReadonlyMap<string, string> = new Map([
  // One Piece B&W (mp-5016) → One Piece Digital Colored Comics (mp-3258)
  ['mp-5016-one-piece', 'mp-3258-one-piece-digital-colored-comics'],
  // One Piece ScanVF (fr) → Punk Records colored (fr)
  ['one_piece', 'pr-one-piece'],
]);

export function getColoredCounterpart(mangaSlug: string): string | null {
  return COLORED_COUNTERPARTS.get(mangaSlug) ?? null;
}
