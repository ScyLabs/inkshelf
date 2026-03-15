export type SourceId = 'mangadex';
export type Language = 'fr' | 'en';

export interface MangaSourceResult {
  slug: string;
  title: string;
  coverUrl: string;
  source: SourceId;
  language: Language;
  latestChapter?: string;
  updatedAt?: number;
  knownChapterCount?: number;
}

export interface ChapterResult {
  slug: string;
  label: string;
  type: 'chapter' | 'volume';
  number: number;
  mangaSlug: string;
  source: SourceId;
}

export interface ChapterDetailResult {
  images: string[];
  prevSlug: string | null;
  nextSlug: string | null;
  title: string;
  mangaSlug: string;
  source: SourceId;
}

export interface MangaInfo {
  synopsis: string | null;
  author: string | null;
  artist: string | null;
  genres: string[];
  status: string | null;
}

export interface MangaSource {
  readonly id: SourceId;
  readonly language: Language;
  readonly allowedImageHosts: string[];
  fetchMangaList(): Promise<MangaSourceResult[]>;
  fetchLatestUpdates?(page?: number): Promise<MangaSourceResult[]>;
  fetchMangaInfo?(mangaSlug: string): Promise<MangaInfo>;
  fetchChapters(mangaSlug: string): Promise<ChapterResult[]>;
  fetchChapter(mangaSlug: string, chapterSlug: string): Promise<ChapterDetailResult>;
}
