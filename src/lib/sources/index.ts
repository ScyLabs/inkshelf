import type { MangaSource, SourceId } from './types';
import { createScanVfSource } from './scanvf';
import { createMangaPillSource } from './mangapill';
import { createMangaDexSource } from './mangadex';
import { createMgekoSource } from './mgeko';
import { createHarimangaSource } from './harimanga';
import { createPunkRecordzSource } from './punkrecordz';

export type { SourceId, Language, MangaSource, MangaSourceResult, MangaInfo, ChapterResult, ChapterDetailResult } from './types';

const sources: Record<SourceId, MangaSource> = {
  scanvf: createScanVfSource(),
  mangapill: createMangaPillSource(),
  mangadex: createMangaDexSource(),
  mgeko: createMgekoSource(),
  harimanga: createHarimangaSource(),
  punkrecordz: createPunkRecordzSource(),
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
  if (mangaSlug.startsWith('mp-')) {
    return sources.mangapill;
  }
  if (mangaSlug.startsWith('md-')) {
    return sources.mangadex;
  }
  if (mangaSlug.startsWith('mgk-')) {
    return sources.mgeko;
  }
  if (mangaSlug.startsWith('hm-')) {
    return sources.harimanga;
  }
  if (mangaSlug.startsWith('pr-')) {
    return sources.punkrecordz;
  }
  if (/^[a-zA-Z0-9_-]+$/.test(mangaSlug)) {
    return sources.scanvf;
  }
  return null;
}
