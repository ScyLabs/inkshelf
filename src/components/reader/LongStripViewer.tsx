'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import ReaderImage from './ReaderImage';
import ChapterTransition from './ChapterTransition';
import DesktopZoomToolbar from './DesktopZoomToolbar';
import { useReadingProgress } from '../../hooks/useReadingProgress';
import { useProgressStore } from '../../stores/progressStore';
import { useIsDesktop, useIsTouchDevice } from '../../hooks/useIsDesktop';

const LOAD_BUFFER = 3;

interface LongStripViewerProps {
  slug: string;
  images: string[];
  nextSlug: string | null;
  onPageChange: (page: number) => void;
  mangaSlug: string;
}

export default function LongStripViewer({ slug, images, nextSlug, onPageChange, mangaSlug }: LongStripViewerProps) {
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const { setCurrentPage } = useReadingProgress(mangaSlug, slug, images.length);
  const savedProgress = useProgressStore((s) => s.getProgress(mangaSlug, slug));
  const restoredRef = useRef(false);
  const initialPage = savedProgress?.currentPage ?? 0;
  const [visiblePage, setVisiblePage] = useState(initialPage);
  const isDesktop = useIsDesktop();
  const isTouch = useIsTouchDevice();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.pageIndex);
            if (!Number.isNaN(index)) {
              setCurrentPage(index);
              setVisiblePage(index);
              onPageChange(index);
            }
          }
        }
      },
      { rootMargin: '100% 0px', threshold: 0.1 },
    );

    const refs = imageRefs.current;
    refs.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [slug, images.length, setCurrentPage, onPageChange]);

  useEffect(() => {
    if (restoredRef.current) return;
    if (!savedProgress || savedProgress.currentPage <= 0) return;
    restoredRef.current = true;

    requestAnimationFrame(() => {
      const target = imageRefs.current[savedProgress.currentPage];
      if (target) {
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    });
  }, [savedProgress]);

  const setRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    imageRefs.current[index] = el;
  }, []);

  const imageStrip = (
    <div className="flex flex-col">
      {images.map((url, i) => (
        <ReaderImage
          key={`${slug}-${i}`}
          ref={setRef(i)}
          originalUrl={url}
          index={i}
          visible={i <= visiblePage + LOAD_BUFFER}
        />
      ))}
    </div>
  );

  return (
    <>
      {isDesktop ? (
        <div className="mx-auto w-full max-w-4xl">
          <TransformWrapper
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
              wrapperStyle={{ width: '100%', overflow: 'visible' }}
              contentStyle={{ width: '100%' }}
            >
              {imageStrip}
            </TransformComponent>
          </TransformWrapper>
        </div>
      ) : (
        imageStrip
      )}
      <ChapterTransition
        currentSlug={slug}
        nextSlug={nextSlug}
        mangaSlug={mangaSlug}
      />
    </>
  );
}
