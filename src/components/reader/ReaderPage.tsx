'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useChapter } from '../../hooks/useChapter';
import { usePrefetch } from '../../hooks/usePrefetch';
import LongStripViewer from './LongStripViewer';
import PagedViewer from './PagedViewer';
import ReaderOverlay from './ReaderOverlay';
import { useSettingsStore } from '../../stores/settingsStore';

export default function ReaderPage() {
  const { mangaSlug, chapterSlug } = useParams<{ mangaSlug: string; chapterSlug: string }>();
  const { chapter, isLoading, error } = useChapter(mangaSlug, chapterSlug);
  const [currentPage, setCurrentPage] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const readingMode = useSettingsStore((s) => s.readingMode);

  usePrefetch(mangaSlug ?? '', currentPage, chapter?.images.length ?? 0, chapter?.nextSlug ?? null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showOverlay = useCallback(() => {
    setOverlayVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setOverlayVisible(false), 3000);
  }, []);

  const toggleOverlay = useCallback(() => {
    if (overlayVisible) {
      setOverlayVisible(false);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      showOverlay();
    }
  }, [overlayVisible, showOverlay]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleTap = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width * 0.3 < x && x < rect.width * 0.7;
      const centerY = rect.height * 0.3 < y && y < rect.height * 0.7;
      if (centerX && centerY) {
        toggleOverlay();
      }
    },
    [toggleOverlay],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-ink-border border-t-ink-cyan" />
      </div>
    );
  }

  if (error) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="flex h-full items-center justify-center px-4">
        {isOffline ? (
          <div className="rounded-lg bg-amber-950 p-4 text-center text-sm text-amber-300">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <p>Offline</p>
            <p className="mt-1 text-zinc-400">This chapter is not available offline.</p>
          </div>
        ) : (
          <div className="rounded-lg bg-red-950 p-4 text-center text-sm text-red-300">
            <p>{error}</p>
          </div>
        )}
      </div>
    );
  }

  if (!chapter || !mangaSlug || !chapterSlug) return null;

  return (
    <div onClick={handleTap} className="min-h-full">
      <ReaderOverlay
        visible={overlayVisible}
        title={chapter.title}
        currentPage={currentPage}
        totalPages={chapter.images.length}
        prevSlug={chapter.prevSlug}
        nextSlug={chapter.nextSlug}
        mangaSlug={mangaSlug}
      />
      {readingMode === 'paged' ? (
        <PagedViewer
          key={chapterSlug}
          slug={chapterSlug}
          images={chapter.images}
          nextSlug={chapter.nextSlug}
          prevSlug={chapter.prevSlug}
          onPageChange={setCurrentPage}
          mangaSlug={mangaSlug}
        />
      ) : (
        <LongStripViewer
          slug={chapterSlug}
          images={chapter.images}
          nextSlug={chapter.nextSlug}
          onPageChange={setCurrentPage}
          mangaSlug={mangaSlug}
        />
      )}
    </div>
  );
}
