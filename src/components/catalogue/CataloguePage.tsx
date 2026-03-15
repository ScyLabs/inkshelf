'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCatalogueStore } from '../../stores/catalogueStore';
import { useProgressStore } from '../../stores/progressStore';
import ChapterCard from './ChapterCard';
import VolumeAccordion from './VolumeAccordion';
import MangaInfoSection from './MangaInfoSection';
import type { MangaInfo, ReadingProgress, VolumeGroup } from '../../types';
import { fetchMangaInfo, fetchArchiveStatus } from '../../services/api';
import type { ArchiveStatusResponse } from '../../services/api';
import { useDownloadStore } from '../../stores/downloadStore';
import { formatMangaSlug, formatChapterSlug } from '../../lib/format';

const TABS = ['all', 'volume', 'chapter'] as const;
const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  all: 'All',
  volume: 'Volumes',
  chapter: 'Chapters',
};

const VIEW_MODES = ['flat', 'volumes'] as const;
const VIEW_MODE_LABELS: Record<(typeof VIEW_MODES)[number], string> = {
  flat: 'Flat',
  volumes: 'Volumes',
};

const CHAPTERS_PER_VOLUME = 10;

function ArchiveBadge({ status }: { status: ArchiveStatusResponse }) {
  const pct = status.totalChapters > 0
    ? Math.round((status.downloadedChapters / status.totalChapters) * 100)
    : 0;

  switch (status.status) {
    case 'pending':
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-500">
          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          En attente...
        </span>
      );
    case 'downloading':
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-500/10 px-2 py-1 text-xs font-medium text-orange-500">
          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {pct}%
        </span>
      );
    case 'completed':
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-green-500/10 px-2 py-1 text-xs font-medium text-green-500">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Archived
        </span>
      );
    case 'partial':
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-yellow-500/10 px-2 py-1 text-xs font-medium text-yellow-500">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Partiel
        </span>
      );
    case 'failed':
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1 text-xs font-medium text-red-500">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Échec
        </span>
      );
    default:
      return null;
  }
}

export default function CataloguePage() {
  const { mangaSlug } = useParams<{ mangaSlug: string }>();
  const load = useCatalogueStore((s) => s.load);
  const loading = useCatalogueStore((s) => s.loading);
  const error = useCatalogueStore((s) => s.error);
  const entries = useCatalogueStore((s) => s.entries);
  const search = useCatalogueStore((s) => s.search);
  const setSearch = useCatalogueStore((s) => s.setSearch);
  const filterType = useCatalogueStore((s) => s.filterType);
  const setFilterType = useCatalogueStore((s) => s.setFilterType);
  const viewMode = useCatalogueStore((s) => s.viewMode);
  const setViewMode = useCatalogueStore((s) => s.setViewMode);
  const hideRead = useCatalogueStore((s) => s.hideRead);
  const setHideRead = useCatalogueStore((s) => s.setHideRead);
  const sortOrder = useCatalogueStore((s) => s.sortOrder);
  const setSortOrder = useCatalogueStore((s) => s.setSortOrder);

  const progress = useProgressStore((s) => s.progress);

  // Build a progress lookup that handles slug changes from colored chapter merging.
  // Old progress may be keyed by ScanVF slug (chapitre-122) while entries now use
  // MangaPill colored slugs. Fallback to matching by chapter number.
  const resolvedProgress = useMemo(() => {
    const byNumber = new Map<number, ReadingProgress>();
    for (const p of Object.values(progress)) {
      if (p.mangaSlug !== mangaSlug) continue;
      // Match chapitre-X, chapter-X, or plain numeric slugs (e.g. "153")
      const match = p.chapterSlug.match(/(?:chapter|chapitre)-(\d+(?:\.\d+)?)$/)
        || p.chapterSlug.match(/^(\d+(?:\.\d+)?)$/);
      if (match) {
        const num = parseFloat(match[1]);
        const existing = byNumber.get(num);
        if (!existing || p.lastReadAt > existing.lastReadAt) {
          byNumber.set(num, p);
        }
      }
    }
    const resolved: Record<string, ReadingProgress> = { ...progress };
    for (const entry of entries) {
      const key = `${mangaSlug}/${entry.slug}`;
      if (!resolved[key]) {
        const byNum = byNumber.get(entry.number);
        if (byNum) resolved[key] = byNum;
      }
    }
    return resolved;
  }, [progress, entries, mangaSlug]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter(e => {
      if (filterType !== 'all' && e.type !== filterType) return false;
      if (q && !e.label.toLowerCase().includes(q) && !String(e.number).includes(q)) return false;
      if (hideRead && resolvedProgress[`${mangaSlug}/${e.slug}`]?.completed) return false;
      return true;
    });
  }, [entries, search, filterType, hideRead, resolvedProgress, mangaSlug]);

  const getLastReadForManga = useProgressStore((s) => s.getLastReadForManga);
  const setSeenChapterCount = useProgressStore((s) => s.setSeenChapterCount);
  const markBatchCompleted = useProgressStore((s) => s.markBatchCompleted);
  const lastRead = useMemo(
    () => (mangaSlug ? getLastReadForManga(mangaSlug) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mangaSlug, progress]
  );

  const router = useRouter();

  const [info, setInfo] = useState<MangaInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [archiveStatus, setArchiveStatus] = useState<ArchiveStatusResponse | null>(null);

  const downloaded = useDownloadStore((s) => s.downloaded);
  const bulkDownload = useDownloadStore((s) => s.bulkDownload);
  const startBulkDownload = useDownloadStore((s) => s.startBulkDownload);
  const cancelBulkDownload = useDownloadStore((s) => s.cancelBulkDownload);

  const undownloadedCount = useMemo(() => {
    if (!mangaSlug) return 0;
    return entries.filter((e) => !((`${mangaSlug}/${e.slug}`) in downloaded)).length;
  }, [entries, downloaded, mangaSlug]);

  const isBulkActive = bulkDownload !== null && bulkDownload.mangaSlug === mangaSlug;

  useEffect(() => {
    if (!mangaSlug) return;
    setInfoLoading(true);
    fetchMangaInfo(mangaSlug).then(setInfo).catch(() => {}).finally(() => setInfoLoading(false));
  }, [mangaSlug]);

  useEffect(() => {
    if (!mangaSlug) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = () => {
      fetchArchiveStatus(mangaSlug).then(status => {
        if (cancelled) return;
        setArchiveStatus(status);
        if (status && (status.status === 'pending' || status.status === 'downloading')) {
          timer = setTimeout(poll, 5000);
        }
      }).catch(() => {});
    };
    poll();

    return () => { cancelled = true; clearTimeout(timer); };
  }, [mangaSlug]);

  useEffect(() => {
    if (mangaSlug) load(mangaSlug);
  }, [mangaSlug, load]);

  // Mark chapter count as "seen" when catalogue loads (only increase, never decrease)
  useEffect(() => {
    if (mangaSlug && entries.length > 0 && !loading) {
      const current = useProgressStore.getState().seenChapterCounts[mangaSlug] ?? 0;
      if (entries.length > current) {
        setSeenChapterCount(mangaSlug, entries.length);
      }
    }
  }, [mangaSlug, entries.length, loading, setSeenChapterCount]);

  const sorted = useMemo(() => {
    const dir = sortOrder === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => (a.number - b.number) * dir);
  }, [filtered, sortOrder]);

  const [batchMode, setBatchMode] = useState(false);

  const handleBatchMark = useCallback((targetSlug: string) => {
    const targetEntry = sorted.find(e => e.slug === targetSlug);
    if (!targetEntry) return;
    const chaptersToMark = sortOrder === 'desc'
      ? sorted.filter(c => c.number >= targetEntry.number)
      : sorted.filter(c => c.number <= targetEntry.number);
    markBatchCompleted(mangaSlug, chaptersToMark.map(c => c.slug));
    setBatchMode(false);
  }, [sorted, mangaSlug, markBatchCompleted, sortOrder]);

  const volumeGroups = useMemo((): VolumeGroup[] => {
    if (viewMode !== 'volumes') return [];
    const groups = new Map<number, VolumeGroup>();
    for (const entry of sorted) {
      const vol = Math.ceil(entry.number / CHAPTERS_PER_VOLUME);
      if (!groups.has(vol)) {
        groups.set(vol, {
          volumeNumber: vol,
          label: `Volume ${vol}`,
          chapters: [],
        });
      }
      const group = groups.get(vol);
      if (group) group.chapters.push(entry);
    }
    const dir = sortOrder === 'desc' ? -1 : 1;
    return Array.from(groups.values()).sort((a, b) => (a.volumeNumber - b.volumeNumber) * dir);
  }, [sorted, viewMode, sortOrder]);

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-4">
      {/* Header with back button */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="shrink-0 rounded-lg p-1.5 text-zinc-300 hover:text-white transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="truncate text-lg font-bold text-white">
          {mangaSlug ? formatMangaSlug(mangaSlug) : 'Chapters'}
        </h1>
        {archiveStatus && <ArchiveBadge status={archiveStatus} />}
      </div>

      <MangaInfoSection info={info} isLoading={infoLoading} />

      {lastRead && !lastRead.completed && (
        <button
          type="button"
          onClick={() => router.push(`/read/${mangaSlug}/${lastRead.chapterSlug}`)}
          className="mb-4 w-full rounded-xl bg-zinc-900 p-4 text-left transition-colors hover:bg-zinc-800 active:bg-zinc-700"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-orange-500">
            Continue Reading
          </span>
          <p className="mt-1 text-sm font-medium text-white">
            {formatChapterSlug(lastRead.chapterSlug)}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-700">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{ width: `${lastRead.scrollPercent * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-xs text-orange-400">Continue</span>
          </div>
        </button>
      )}

      <input
        type="text"
        placeholder="Search chapters..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500 transition-colors"
      />

      <div className="mb-4 flex gap-2">
        <div className="flex flex-1 gap-1 rounded-lg bg-zinc-900 p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilterType(tab)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filterType === tab
                  ? 'bg-orange-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-orange-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {VIEW_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setHideRead(!hideRead)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            hideRead
              ? 'bg-orange-500/10 text-orange-500 border border-orange-500/30'
              : 'bg-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {hideRead ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
          {hideRead ? 'Read hidden' : 'Show all'}
        </button>
        <button
          type="button"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={sortOrder === 'asc' ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
          </svg>
          {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-950 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="mb-3 flex flex-col gap-2">
          {/* Bulk download button */}
          {(undownloadedCount > 0 || isBulkActive) && (
            isBulkActive ? (
              <div className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-orange-400">
                      {bulkDownload.completedChapters}/{bulkDownload.totalChapters} chapitres
                    </span>
                    <span className="text-zinc-500">
                      {bulkDownload.totalChapters > 0
                        ? Math.round((bulkDownload.completedChapters / bulkDownload.totalChapters) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-orange-500 transition-all"
                      style={{
                        width: `${bulkDownload.totalChapters > 0
                          ? (bulkDownload.completedChapters / bulkDownload.totalChapters) * 100
                          : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cancelBulkDownload}
                  className="shrink-0 rounded-md p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startBulkDownload(mangaSlug, entries.map((e) => e.slug))}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download all ({undownloadedCount} chapters)
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => setBatchMode((v) => !v)}
            className={`w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              batchMode
                ? 'bg-orange-500/10 text-orange-500 border border-orange-500/30'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            {batchMode ? 'Annuler' : 'Marquer lu jusqu\'au...'}
          </button>
        </div>
      )}

      {!loading && !error && viewMode === 'flat' && (
        <div className="flex flex-col gap-2">
          {sorted.map((entry) => (
            <ChapterCard
              key={entry.slug}
              entry={entry}
              mangaSlug={mangaSlug}
              progress={resolvedProgress[`${mangaSlug}/${entry.slug}`]}
              batchMode={batchMode}
              onBatchMark={handleBatchMark}
            />
          ))}
          {sorted.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              {hideRead && entries.length > 0 ? 'All chapters read.' : 'No chapters found.'}
            </p>
          )}
        </div>
      )}

      {!loading && !error && viewMode === 'volumes' && (
        <div className="flex flex-col gap-3">
          {volumeGroups.map((group) => (
            <VolumeAccordion
              key={group.volumeNumber}
              group={group}
              mangaSlug={mangaSlug}
              progress={resolvedProgress}
              batchMode={batchMode}
              onBatchMark={handleBatchMark}
            />
          ))}
          {volumeGroups.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">
              {hideRead && entries.length > 0 ? 'All chapters read.' : 'No chapters found.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
