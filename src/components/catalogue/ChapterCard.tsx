'use client';

import { useRouter } from 'next/navigation';
import type { CatalogueEntry, ReadingProgress } from '../../types';
import { downloadChapter } from '../../services/offlineDownload';
import { useDownloadStore } from '../../stores/downloadStore';

interface ChapterCardProps {
  entry: CatalogueEntry;
  mangaSlug: string;
  progress?: ReadingProgress;
  batchMode?: boolean;
  onBatchMark?: (slug: string) => void;
}

export default function ChapterCard({ entry, mangaSlug, progress, batchMode, onBatchMark }: ChapterCardProps) {
  const router = useRouter();
  const isDownloaded = useDownloadStore((s) => s.isDownloaded(mangaSlug, entry.slug));
  const activeProgress = useDownloadStore((s) => s.getActiveProgress(mangaSlug, entry.slug));
  const markDownloaded = useDownloadStore((s) => s.markDownloaded);
  const setActiveProgress = useDownloadStore((s) => s.setActiveProgress);
  const clearActiveProgress = useDownloadStore((s) => s.clearActiveProgress);

  const handleDownload = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDownloaded) return;
    if (activeProgress && !activeProgress.error && activeProgress.done < activeProgress.total) return;
    setActiveProgress(mangaSlug, entry.slug, { total: 0, done: 0, error: false });
    downloadChapter(mangaSlug, entry.slug, (p) => {
      setActiveProgress(mangaSlug, entry.slug, p);
    }).then(() => {
      markDownloaded(mangaSlug, entry.slug);
      clearActiveProgress(mangaSlug, entry.slug);
    }).catch(() => {
      setActiveProgress(mangaSlug, entry.slug, { total: 0, done: 0, error: true });
    });
  };

  const dlDone = isDownloaded || (activeProgress && activeProgress.done === activeProgress.total && activeProgress.total > 0);
  const dlError = activeProgress?.error && activeProgress.done === activeProgress.total;
  const dlInProgress = activeProgress && !dlDone && !dlError && activeProgress.total > 0;

  return (
    <button
      type="button"
      onClick={() => batchMode && onBatchMark ? onBatchMark(entry.slug) : router.push(`/read/${mangaSlug}/${entry.slug}`)}
      className={`w-full text-left rounded-xl bg-zinc-900 p-4 transition-colors hover:bg-zinc-800 active:bg-zinc-700${batchMode ? ' border-l-2 border-orange-500' : ''}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 72px' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              {entry.type === 'volume' ? 'Vol' : 'Ch'} {entry.number}
            </span>
            {progress?.completed && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-500 shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm font-medium text-white">
            {entry.label}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {batchMode ? (
            <span className="text-xs font-medium text-orange-500">
              Marquer jusqu&apos;ici
            </span>
          ) : progress && !progress.completed && progress.totalPages > 0 ? (
            <div className="text-right">
              <span className="text-xs text-zinc-400">
                {progress.currentPage + 1}/{progress.totalPages}
              </span>
              <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-zinc-700">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all"
                  style={{ width: `${((progress.currentPage + 1) / progress.totalPages) * 100}%` }}
                />
              </div>
            </div>
          ) : null}
          {!batchMode && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleDownload}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDownload(e); }}
              className="p-1.5"
            >
              {dlDone && !dlError ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                  <path d="M12 5v8m-4-4 4 4 4-4" />
                  <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
              ) : dlError ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : dlInProgress ? (
                <span className="text-xs tabular-nums text-orange-400">
                  {activeProgress ? Math.round((activeProgress.done / activeProgress.total) * 100) : 0}%
                </span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 hover:text-orange-500 transition-colors">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              )}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
