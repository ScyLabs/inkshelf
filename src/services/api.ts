import type { AppSettings, CatalogueEntry, ChapterData, Language, MangaInfo, MangaListItem, ReadingProgress } from '../types';

const BASE = '';

export async function fetchMangaList(lang?: Language): Promise<MangaListItem[]> {
  const query = lang ? `?lang=${lang}` : '';
  const res = await fetch(`${BASE}/api/manga${query}`);
  if (!res.ok) throw new Error(`Manga list fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchLatestMangas(lang: Language, type: 'updates' | 'new'): Promise<MangaListItem[]> {
  const res = await fetch(`${BASE}/api/manga/latest?lang=${lang}&type=${type}`);
  if (!res.ok) throw new Error(`Latest mangas fetch failed: ${res.status}`);
  return res.json();
}

export async function searchMangas(query: string, lang?: Language): Promise<MangaListItem[]> {
  const params = new URLSearchParams({ q: query });
  if (lang) params.set('lang', lang);
  const res = await fetch(`${BASE}/api/manga/search?${params.toString()}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}

export async function fetchMangaInfo(mangaSlug: string): Promise<MangaInfo | null> {
  const res = await fetch(`${BASE}/api/manga/${mangaSlug}/info`);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchMangaChapters(mangaSlug: string): Promise<CatalogueEntry[]> {
  const res = await fetch(`${BASE}/api/manga/${mangaSlug}/chapters`);
  if (!res.ok) throw new Error(`Chapters fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchMangaChapter(mangaSlug: string, chapterSlug: string): Promise<ChapterData> {
  const res = await fetch(`${BASE}/api/manga/${mangaSlug}/chapter/${chapterSlug}`);
  if (!res.ok) throw new Error(`Chapter fetch failed: ${res.status}`);
  return res.json();
}

export async function syncProgressToServer(
  userId: string,
  progress: Record<string, ReadingProgress>,
): Promise<void> {
  const res = await fetch(`${BASE}/api/progress/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress }),
  });
  if (!res.ok) throw new Error(`Sync push failed: ${res.status}`);
}

export async function fetchProgressFromServer(
  userId: string,
): Promise<Record<string, ReadingProgress>> {
  const res = await fetch(`${BASE}/api/progress/${userId}`);
  if (!res.ok) throw new Error(`Sync pull failed: ${res.status}`);
  const data = await res.json();
  return data.progress ?? {};
}

export async function pushSingleProgress(
  userId: string,
  mangaSlug: string,
  chapterSlug: string,
  update: Partial<ReadingProgress>,
): Promise<void> {
  const res = await fetch(`${BASE}/api/progress/${userId}/${mangaSlug}/${chapterSlug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error(`Single progress push failed: ${res.status}`);
}

export async function pushBatchProgress(
  userId: string,
  mangaSlug: string,
  chapterSlugs: string[],
): Promise<void> {
  const res = await fetch(`${BASE}/api/progress/${userId}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mangaSlug, chapterSlugs }),
  });
  if (!res.ok) throw new Error(`Batch progress push failed: ${res.status}`);
}

export interface UserState {
  progress: Record<string, ReadingProgress>;
  library: string[];
  favorites: string[];
  settings: AppSettings;
}

export async function fetchUserState(userId: string): Promise<UserState> {
  const res = await fetch(`${BASE}/api/user/${userId}`);
  if (!res.ok) throw new Error(`User state fetch failed: ${res.status}`);
  return res.json();
}

export async function fetchSyncCheck(userId: string): Promise<number | null> {
  const res = await fetch(`${BASE}/api/user/${userId}/sync-check`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.lastUseAt ?? null;
}

export async function pushLibraryAction(
  userId: string,
  action: 'add' | 'remove' | 'favorite' | 'unfavorite',
  mangaSlug: string,
): Promise<void> {
  const res = await fetch(`${BASE}/api/user/${userId}/library`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, mangaSlug }),
  });
  if (!res.ok) throw new Error(`Library action failed: ${res.status}`);
}

export async function pushSettings(
  userId: string,
  settings: AppSettings,
): Promise<void> {
  const res = await fetch(`${BASE}/api/user/${userId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`Settings push failed: ${res.status}`);
}

export async function fetchVapidKey(): Promise<string> {
  const res = await fetch(`${BASE}/api/push/vapid-key`);
  if (!res.ok) return '';
  const data = await res.json();
  return data.key ?? '';
}

export async function subscribePush(userId: string, subscription: PushSubscriptionJSON): Promise<void> {
  const res = await fetch(`${BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, subscription }),
  });
  if (!res.ok) throw new Error(`Push subscribe failed: ${res.status}`);
}

export async function unsubscribePush(userId: string, endpoint: string): Promise<void> {
  const res = await fetch(`${BASE}/api/push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, endpoint }),
  });
  if (!res.ok) throw new Error(`Push unsubscribe failed: ${res.status}`);
}

export interface ArchiveStatusResponse {
  status: string;
  totalChapters: number;
  downloadedChapters: number;
  totalImages: number;
  downloadedImages: number;
  failedImages: number;
  error: string | null;
}

export async function fetchArchiveStatus(mangaSlug: string): Promise<ArchiveStatusResponse | null> {
  const res = await fetch(`${BASE}/api/archive/${mangaSlug}`);
  if (!res.ok) return null;
  return res.json();
}

/** @deprecated Use fetchMangaChapters('one_piece') instead */
export async function fetchCatalogue(): Promise<CatalogueEntry[]> {
  return fetchMangaChapters('one_piece');
}

/** @deprecated Use fetchMangaChapter('one_piece', slug) instead */
export async function fetchChapter(slug: string): Promise<ChapterData> {
  return fetchMangaChapter('one_piece', slug);
}
