'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MangaListItem } from '@/types';
import { useProgressStore } from '@/stores/progressStore';
import { formatRelativeDate } from '@/lib/format';
import { buildProxyImageUrl } from '@/services/imageProxy';

interface MangaCardProps {
  manga: MangaListItem;
  hasNew?: boolean;
  showRemove?: boolean;
  showChapterInfo?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (mangaSlug: string) => void;
}

export default function MangaCard({ manga, hasNew, showRemove, showChapterInfo, isFavorite, onToggleFavorite }: MangaCardProps) {
  const router = useRouter();
  const progress = useProgressStore((s) => s.progress);
  const unfollowManga = useProgressStore((s) => s.unfollowManga);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const stats = useMemo(() => {
    const entries = Object.values(progress).filter(
      (p) => p.mangaSlug === manga.slug
    );
    const total = entries.length;
    const completed = entries.filter((p) => p.completed).length;
    return { total, completed };
  }, [progress, manga.slug]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    unfollowManga(manga.slug);
  };

  return (
    <button
      type="button"
      onClick={() => router.push(`/manga/${manga.slug}`)}
      className="relative flex flex-col overflow-hidden rounded-xl bg-zinc-900 transition-colors hover:bg-zinc-800 active:bg-zinc-700"
    >
      <div className="relative aspect-[3/4] w-full bg-zinc-800">
        {manga.coverUrl ? (
          <img
            src={buildProxyImageUrl(manga.coverUrl)}
            alt={manga.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
        )}
        {hasNew && (
          <span className="absolute top-2 right-2 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            NEW
          </span>
        )}
        {showRemove && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleRemove}
            onBlur={() => setConfirmRemove(false)}
            className={`absolute top-2 left-2 flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold text-white transition-colors ${
              confirmRemove ? 'bg-red-600' : 'bg-black/60 hover:bg-red-600'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
            {confirmRemove && 'Remove ?'}
          </span>
        )}
        {onToggleFavorite && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleFavorite(manga.slug);
            }}
            className={`absolute bottom-2 right-2 rounded-full bg-black/60 p-1.5 transition-colors ${
              isFavorite ? 'text-yellow-400' : 'text-zinc-400 hover:text-yellow-400'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-white">{manga.title}</p>
        {showChapterInfo && manga.latestChapter && (
          <p className="mt-0.5 truncate text-xs text-orange-400">{manga.latestChapter}</p>
        )}
        {showChapterInfo && manga.updatedAt && (
          <p className="mt-0.5 text-[10px] text-zinc-500">{formatRelativeDate(manga.updatedAt)}</p>
        )}
        {stats.total > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-700">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{ width: `${(stats.completed / stats.total) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] text-zinc-500">
              {stats.completed}/{stats.total}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
