import type { MangaSource, SourceId } from './types';
import { createMangaDexSource } from './mangadex';

export type { SourceId, Language, MangaSource, MangaSourceResult, MangaInfo, ChapterResult, ChapterDetailResult } from './types';

const sources: Record<SourceId, MangaSource> = {
  mangadex: createMangaDexSource(),
};

export function getSource(id: SourceId): MangaSource {
  return sources[id];
}

export function getAllSources(): MangaSource[] {
  return Object.values(sources);
}

export function getSourceIds(): SourceId[] {
  return Object.keys(sources) as SourceId[];
}

export function getAllAllowedImageHosts(): string[] {
  return getAllSources().flatMap((s) => s.allowedImageHosts);
}

export function getSourcesWithLatestUpdates(): MangaSource[] {
  return getAllSources().filter((s) => typeof s.fetchLatestUpdates === 'function');
}

export function resolveSourceFromMangaSlug(mangaSlug: string): MangaSource | null {
  if (mangaSlug.startsWith('md-')) {
    return sources.mangadex;
  }
  return null;
}
