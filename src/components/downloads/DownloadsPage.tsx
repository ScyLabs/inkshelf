'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useDownloadStore } from '../../stores/downloadStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { formatMangaSlug, formatChapterSlug, formatRelativeDate } from '../../lib/format';

interface DownloadEntry {
  mangaSlug: string;
  chapterSlug: string;
  timestamp: number;
  key: string;
}

interface MangaGroup {
  mangaSlug: string;
  title: string;
  chapters: DownloadEntry[];
}

export default function DownloadsPage() {
  const downloaded = useDownloadStore((s) => s.downloaded);
  const removeDownloadedWithCache = useDownloadStore((s) => s.removeDownloadedWithCache);
  const clearAllDownloads = useDownloadStore((s) => s.clearAllDownloads);
  const mangas = useLibraryStore((s) => s.mangas);

  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(clearTimerRef.current), []);

  const groups = useMemo<MangaGroup[]>(() => {
    const entries: DownloadEntry[] = Object.entries(downloaded)
      .filter(([key]) => key.includes('/'))
      .map(([key, ts]) => {
        const idx = key.indexOf('/');
        return { mangaSlug: key.substring(0, idx), chapterSlug: key.substring(idx + 1), timestamp: ts, key };
      });

    const grouped = new Map<string, DownloadEntry[]>();
    for (const e of entries) {
      const list = grouped.get(e.mangaSlug) ?? [];
      list.push(e);
      grouped.set(e.mangaSlug, list);
    }

    return Array.from(grouped.entries())
      .map(([mangaSlug, chapters]) => ({
        mangaSlug,
        title: mangas.find((m) => m.slug === mangaSlug)?.title ?? formatMangaSlug(mangaSlug),
        chapters: chapters.sort((a, b) => b.timestamp - a.timestamp),
      }))
      .sort((a, b) => b.chapters[0].timestamp - a.chapters[0].timestamp);
  }, [downloaded, mangas]);

  const totalCount = Object.keys(downloaded).length;

  async function handleDeleteChapter(mangaSlug: string, chapterSlug: string) {
    const key = `${mangaSlug}/${chapterSlug}`;
    setDeleting((prev) => new Set(prev).add(key));
    try {
      await removeDownloadedWithCache(mangaSlug, chapterSlug);
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleClearAll() {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      clearTimerRef.current = setTimeout(() => setConfirmClearAll(false), 3000);
      return;
    }
    setClearing(true);
    try {
      await clearAllDownloads();
    } finally {
      setClearing(false);
      setConfirmClearAll(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-24">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link href="/settings" className="flex items-center justify-center rounded-lg p-1.5 text-zinc-400 hover:text-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <h1 className="flex-1 text-xl font-bold text-white">Downloads</h1>
        {totalCount > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              confirmClearAll
                ? 'bg-red-600 text-white'
                : 'bg-ink-card text-zinc-400 hover:text-white border border-ink-border'
            }`}
          >
            {clearing ? 'Deleting...' : confirmClearAll ? 'Confirm' : 'Delete All'}
          </button>
        )}
      </div>

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 text-zinc-700">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <p className="text-sm font-medium text-zinc-400">No downloaded chapters</p>
          <p className="mt-1 text-xs text-zinc-600">Downloaded chapters will appear here</p>
        </div>
      )}

      {/* Manga groups */}
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.mangaSlug} className="rounded-xl bg-ink-card p-4 border border-ink-border">
            {/* Manga header */}
            <div className="mb-3 flex items-center justify-between">
              <Link href={`/manga/${group.mangaSlug}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{group.title}</p>
                <p className="text-xs text-zinc-500">{group.chapters.length} chapter{group.chapters.length > 1 ? 's' : ''}</p>
              </Link>
            </div>

            {/* Chapter list */}
            <div className="flex flex-col">
              {group.chapters.map((ch) => {
                const isDel = deleting.has(ch.key);
                return (
                  <div key={ch.key} className="flex items-center justify-between border-b border-ink-border py-2.5 last:border-0">
                    <Link
                      href={`/read/${ch.mangaSlug}/${ch.chapterSlug}`}
                      className="min-w-0 flex-1"
                    >
                      <p className="truncate text-sm text-white">{formatChapterSlug(ch.chapterSlug)}</p>
                      <p className="text-[10px] text-zinc-500">{formatRelativeDate(Math.floor(ch.timestamp / 1000))}</p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteChapter(ch.mangaSlug, ch.chapterSlug)}
                      disabled={isDel}
                      className="shrink-0 p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      {isDel ? (
                        <div className="h-4 w-4 animate-spin rounded-full border border-zinc-600 border-t-ink-cyan" />
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
