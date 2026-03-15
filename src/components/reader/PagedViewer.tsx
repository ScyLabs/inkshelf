'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import ReaderImage from './ReaderImage';
import ChapterTransition from './ChapterTransition';
import DesktopZoomToolbar from './DesktopZoomToolbar';
import { useReadingProgress } from '../../hooks/useReadingProgress';
import { useProgressStore } from '../../stores/progressStore';
import { buildProxyImageUrl } from '../../services/imageProxy';
import { useIsDesktop, useIsTouchDevice } from '../../hooks/useIsDesktop';

interface PagedViewerProps {
  slug: string;
  images: string[];
  nextSlug: string | null;
  prevSlug: string | null;
  onPageChange: (page: number) => void;
  mangaSlug: string;
}

const SWIPE_MIN_DISTANCE = 50;
const SWIPE_DIRECTION_RATIO = 1.5;
const SWIPE_MAX_DURATION = 500;

export default function PagedViewer({ slug, images, nextSlug, onPageChange, mangaSlug }: PagedViewerProps) {
  const savedProgress = useProgressStore((s) => s.getProgress(mangaSlug, slug));
  const [currentPage, setCurrentPageState] = useState(savedProgress?.currentPage ?? 0);
  const { setCurrentPage: saveCurrentPage } = useReadingProgress(mangaSlug, slug, images.length);
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const isDesktop = useIsDesktop();
  const isTouch = useIsTouchDevice();

  useEffect(() => {
    saveCurrentPage(currentPage);
    onPageChange(currentPage);
  }, [currentPage, saveCurrentPage, onPageChange]);

  const goNext = useCallback(() => {
    setCurrentPageState((prev) => prev < images.length ? prev + 1 : prev);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentPageState((prev) => prev > 0 ? prev - 1 : prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchRef.current.x;
    const deltaY = touch.clientY - touchRef.current.y;
    const deltaTime = Date.now() - touchRef.current.t;
    touchRef.current = null;

    if (
      Math.abs(deltaX) > SWIPE_MIN_DISTANCE &&
      Math.abs(deltaX) > Math.abs(deltaY) * SWIPE_DIRECTION_RATIO &&
      deltaTime < SWIPE_MAX_DURATION
    ) {
      if (deltaX < 0) {
        goNext();
      } else {
        goPrev();
      }
    }
  }, [goNext, goPrev]);

  const handleTap = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const relX = x / rect.width;

    if (relX < 0.3) {
      e.stopPropagation();
      goPrev();
    } else if (relX > 0.7) {
      e.stopPropagation();
      goNext();
    }
  }, [goNext, goPrev]);

  useEffect(() => {
    const urls: string[] = [];
    if (currentPage > 0) urls.push(buildProxyImageUrl(images[currentPage - 1]));
    if (currentPage < images.length - 1) urls.push(buildProxyImageUrl(images[currentPage + 1]));
    urls.forEach((url) => { const img = new Image(); img.src = url; });
  }, [currentPage, images]);

  if (currentPage >= images.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <ChapterTransition
          currentSlug={slug}
          nextSlug={nextSlug}
          mangaSlug={mangaSlug}
        />
      </div>
    );
  }

  const pageImage = (
    <ReaderImage
      key={`${slug}-${currentPage}`}
      originalUrl={images[currentPage]}
      index={currentPage}
      visible
    />
  );

  return (
    <div
      className="flex h-full items-center justify-center"
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {isDesktop ? (
        <div className="mx-auto w-full max-w-4xl">
          <TransformWrapper
            key={`${slug}-${currentPage}`}
            initialScale={1}
            minScale={0.5}
            maxScale={4}
            wheel={{ step: 0.1, activationKeys: isTouch ? [] : ['Control', 'Meta'] }}
            panning={{ disabled: isTouch }}
            pinch={{ disabled: false }}
            doubleClick={{ mode: 'reset' }}
          >
            {!isTouch && <DesktopZoomToolbar />}
            <TransformComponent
              wrapperStyle={{ width: '100%' }}
              contentStyle={{ width: '100%' }}
            >
              {pageImage}
            </TransformComponent>
          </TransformWrapper>
        </div>
      ) : (
        pageImage
      )}
    </div>
  );
}
