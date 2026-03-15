import { useEffect, useRef, useCallback } from 'react';
import { useProgressStore } from '../stores/progressStore';

export function useReadingProgress(mangaSlug: string | undefined, chapterSlug: string | undefined, totalPages: number) {
  const currentPageRef = useRef(0);
  const updateProgress = useProgressStore((s) => s.updateProgress);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveProgress = useCallback(() => {
    if (!mangaSlug || !chapterSlug) return;
    const container = document.querySelector('main');
    if (!container) return;
    const scrollPercent = container.scrollHeight > container.clientHeight
      ? container.scrollTop / (container.scrollHeight - container.clientHeight)
      : 0;

    updateProgress(mangaSlug, chapterSlug, {
      currentPage: currentPageRef.current,
      totalPages,
      scrollPercent,
    });
  }, [mangaSlug, chapterSlug, totalPages, updateProgress]);

  const debouncedSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(saveProgress, 2000);
  }, [saveProgress]);

  const setCurrentPage = useCallback((page: number) => {
    currentPageRef.current = page;
    debouncedSave();
  }, [debouncedSave]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        saveProgress();
      }
    };
  }, [saveProgress]);

  return { currentPageRef, setCurrentPage, saveProgress };
}
