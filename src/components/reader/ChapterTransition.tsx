'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useProgressStore, flushPendingPush } from '../../stores/progressStore';
import { formatChapterSlug } from '../../lib/format';

interface ChapterTransitionProps {
  currentSlug: string;
  nextSlug: string | null;
  nextTitle?: string;
  mangaSlug: string;
}

export default function ChapterTransition({ currentSlug, nextSlug, nextTitle, mangaSlug }: ChapterTransitionProps) {
  const router = useRouter();
  const markCompleted = useProgressStore((s) => s.markCompleted);
  const markedRef = useRef(false);

  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !markedRef.current) {
          markedRef.current = true;
          markCompleted(mangaSlug, currentSlug);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mangaSlug, currentSlug, markCompleted]);

  return (
    <div ref={elementRef} className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <p className="text-lg font-semibold text-white">Chapter complete!</p>
      {nextSlug ? (
        <button
          type="button"
          onClick={() => { flushPendingPush(); router.push(`/read/${mangaSlug}/${nextSlug}`); }}
          className="mt-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-orange-600 active:bg-orange-700"
        >
          Next: {nextTitle || formatChapterSlug(nextSlug)}
        </button>
      ) : (
        <p className="text-sm text-zinc-400">Tu es à jour !</p>
      )}
    </div>
  );
}
