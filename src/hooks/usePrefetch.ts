import { useEffect, useRef } from 'react';
import { fetchMangaChapter } from '../services/api';
import { buildProxyImageUrl } from '../services/imageProxy';

export function usePrefetch(
  mangaSlug: string,
  currentPage: number,
  totalPages: number,
  nextSlug: string | null,
) {
  const prefetchedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!nextSlug) return;
    if (totalPages === 0) return;
    if (currentPage / totalPages < 0.8) return;
    if (prefetchedRef.current === nextSlug) return;

    prefetchedRef.current = nextSlug;

    fetchMangaChapter(mangaSlug, nextSlug).then((data) => {
      data.images.slice(0, 3).forEach((url) => {
        const img = new Image();
        img.src = buildProxyImageUrl(url);
      });
    }).catch(() => {
      // silently fail prefetch
    });
  }, [mangaSlug, currentPage, totalPages, nextSlug]);
}
