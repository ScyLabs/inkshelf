'use client';

import { useRouter } from 'next/navigation';
import { flushPendingPush } from '../../stores/progressStore';

interface ReaderOverlayProps {
  visible: boolean;
  title: string;
  currentPage: number;
  totalPages: number;
  prevSlug: string | null;
  nextSlug: string | null;
  mangaSlug: string;
}

export default function ReaderOverlay({
  visible,
  title,
  currentPage,
  totalPages,
  prevSlug,
  nextSlug,
  mangaSlug,
}: ReaderOverlayProps) {
  const router = useRouter();

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-50 flex flex-col justify-between transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Top bar */}
      <div
        className={`pointer-events-auto glass-strong px-4 py-3 flex items-center gap-3 transition-transform duration-200 ${
          visible ? 'translate-y-0' : '-translate-y-full'
        }`}
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={() => router.push(`/manga/${mangaSlug}`)}
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:text-white transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <p className="truncate text-sm font-medium text-white">{title}</p>
      </div>

      {/* Bottom bar */}
      <div
        className={`pointer-events-auto glass-strong px-4 py-3 flex items-center justify-between gap-4 transition-transform duration-200 ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => prevSlug && router.push(`/read/${mangaSlug}/${prevSlug}`)}
          disabled={!prevSlug}
          className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <span className="text-sm font-medium tabular-nums text-white">
          {currentPage + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => { if (nextSlug) { flushPendingPush(); router.push(`/read/${mangaSlug}/${nextSlug}`); } }}
          disabled={!nextSlug}
          className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
