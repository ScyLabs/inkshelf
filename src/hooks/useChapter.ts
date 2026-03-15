import { useEffect, useState } from 'react';
import type { ChapterData } from '../types';
import { fetchMangaChapter } from '../services/api';
import { getOfflineCachedChapter } from '../services/offlineDownload';

export function useChapter(mangaSlug: string | undefined, chapterSlug: string | undefined) {
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mangaSlug || !chapterSlug) return;

    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching pattern
    setIsLoading(true);
    setError(null);
    setChapter(null);

    fetchMangaChapter(mangaSlug, chapterSlug)
      .then((data) => {
        if (!cancelled) {
          setChapter(data);
          setIsLoading(false);
        }
      })
      .catch(async (e) => {
        if (cancelled) return;
        try {
          const cached = await getOfflineCachedChapter(mangaSlug, chapterSlug);
          if (!cancelled && cached) {
            setChapter(cached);
            setIsLoading(false);
            return;
          }
        } catch {
          // ignore cache errors
        }
        if (!cancelled) {
          const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
          setError(
            isOffline
              ? 'You are offline and this chapter is not downloaded.'
              : (e as Error).message,
          );
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mangaSlug, chapterSlug]);

  return { chapter, isLoading, error };
}
