import type { SourceId, Language } from '@/lib/sources/types';
export type { SourceId, Language, MangaInfo } from '@/lib/sources/types';

export interface MangaListItem {
  slug: string;
  title: string;
  coverUrl: string;
  source: SourceId;
  language: Language;
  latestChapter?: string;
  updatedAt?: number;
  knownChapterCount?: number;
}

export interface CatalogueEntry {
  slug: string;
  label: string;
  type: 'chapter' | 'volume';
  number: number;
  mangaSlug: string;
  source: SourceId;
}

export interface VolumeGroup {
  volumeNumber: number;
  label: string;
  chapters: CatalogueEntry[];
}

export interface ChapterData {
  images: string[];
  prevSlug: string | null;
  nextSlug: string | null;
  title: string;
  mangaSlug: string;
  source: SourceId;
}

export interface ReadingProgress {
  chapterSlug: string;
  mangaSlug: string;
  currentPage: number;
  totalPages: number;
  scrollPercent: number;
  lastReadAt: number;
  completed: boolean;
}

export interface UserIdentity {
  userId: string;
  createdAt: number;
}

export type ReadingMode = 'longstrip' | 'paged';

export interface AppSettings {
  readingMode: ReadingMode;
  prefetchCount: number;
  autoNextChapter: boolean;
  language: Language;
}
