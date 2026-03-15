'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLibraryStore, type SortMode } from '../../stores/libraryStore';
import { useProgressStore } from '../../stores/progressStore';
import { useSettingsStore } from '../../stores/settingsStore';
import MangaCard from './MangaCard';
import type { Language, MangaListItem, SourceId } from '../../types';
import { formatMangaSlug, formatChapterSlug } from '../../lib/format';

const PAGE_SIZE = 20;

type Tab = 'my-library' | 'favorites' | 'all' | 'latest-updates' | 'latest-new';

const TABS: { value: Tab; label: string }[] = [
  { value: 'my-library', label: 'Library' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'all', label: 'Browse' },
  { value: 'latest-updates', label: 'Latest' },
  { value: 'latest-new', label: 'New' },
];

const VALID_TABS = new Set(TABS.map(t => t.value));

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'Newest' },
  { value: 'last-read', label: 'Last Read' },
  { value: 'added-recent', label: 'Recently Added' },
  { value: 'alphabetical', label: 'A-Z' },
];

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-ink-card animate-pulse border border-ink-border">
      <div className="aspect-[3/4] w-full bg-ink-gray" />
      <div className="p-3">
        <div className="h-3.5 w-3/4 rounded bg-ink-gray" />
        <div className="mt-2 h-2.5 w-1/2 rounded bg-ink-gray" />
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const load = useLibraryStore((s) => s.load);
  const loading = useLibraryStore((s) => s.loading);
  const error = useLibraryStore((s) => s.error);
  const mangas = useLibraryStore((s) => s.mangas);
  const search = useLibraryStore((s) => s.search);
  const setSearch = useLibraryStore((s) => s.setSearch);
  const doSearch = useLibraryStore((s) => s.doSearch);
  const searchResults = useLibraryStore((s) => s.searchResults);
  const searchLoading = useLibraryStore((s) => s.searchLoading);
  const latestUpdates = useLibraryStore((s) => s.latestUpdates);
  const latestNew = useLibraryStore((s) => s.latestNew);
  const loadingLatestUpdates = useLibraryStore((s) => s.loadingLatestUpdates);
  const loadingLatestNew = useLibraryStore((s) => s.loadingLatestNew);
  const loadLatest = useLibraryStore((s) => s.loadLatest);
  const sortMode = useLibraryStore((s) => s.sortMode);
  const setSortMode = useLibraryStore((s) => s.setSortMode);

  const language = useSettingsStore((s) => s.language);

  const progress = useProgressStore((s) => s.progress);
  const followedSlugs = useProgressStore((s) => s.followedSlugs);
  const favoriteSlugs = useProgressStore((s) => s.favoriteSlugs);
  const toggleFavorite = useProgressStore((s) => s.toggleFavorite);
  const seenChapterCounts = useProgressStore((s) => s.seenChapterCounts);
  const setSeenChapterCount = useProgressStore((s) => s.setSeenChapterCount);

  const followedSet = useMemo(() => new Set(followedSlugs), [followedSlugs]);
  const favoriteSet = useMemo(() => new Set(favoriteSlugs), [favoriteSlugs]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab') as Tab | null;
  const tab = (tabParam && VALID_TABS.has(tabParam)) ? tabParam : (followedSlugs.length > 0 ? 'my-library' : 'all');
  const isUserTab = tab === 'my-library' || tab === 'favorites';

  const setTab = useCallback((newTab: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', newTab);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const lastRead = useMemo(() => {
    const all = Object.values(progress);
    if (all.length === 0) return undefined;
    return all.reduce((latest, p) => p.lastReadAt > latest.lastReadAt ? p : latest);
  }, [progress]);

  useEffect(() => {
    load(language);
  }, [load, language]);

  useEffect(() => {
    if (tab === 'latest-updates') {
      loadLatest('updates', language);
    } else if (tab === 'latest-new') {
      loadLatest('new', language);
    }
  }, [tab, language, loadLatest]);

  useEffect(() => {
    if (!isUserTab) doSearch(search, language);
  }, [search, language, doSearch, isUserTab]);

  const isSearching = search.trim().length > 0;
  const isServerSearching = isSearching && !isUserTab;

  const sourceList = useMemo((): MangaListItem[] => {
    if (isServerSearching) return searchResults;
    if (tab === 'latest-updates') return latestUpdates;
    if (tab === 'latest-new') return latestNew;
    return mangas;
  }, [tab, mangas, latestUpdates, latestNew, isServerSearching, searchResults]);

  useEffect(() => {
    if (!isUserTab) return;
    const current = useProgressStore.getState().seenChapterCounts;
    for (const manga of sourceList) {
      if (!followedSet.has(manga.slug)) continue;
      if (!manga.knownChapterCount || manga.knownChapterCount === 0) continue;
      if (current[manga.slug] !== undefined) continue;
      setSeenChapterCount(manga.slug, manga.knownChapterCount);
    }
  }, [isUserTab, tab, sourceList, followedSet, setSeenChapterCount]);

  const newSlugs = useMemo(() => {
    if (!isUserTab) return new Set<string>();
    const slugs = new Set<string>();
    for (const manga of sourceList) {
      if (!followedSet.has(manga.slug)) continue;
      const known = manga.knownChapterCount;
      if (!known || known === 0) continue;
      const seen = seenChapterCounts[manga.slug];
      if (seen === undefined) continue;
      if (known > seen) slugs.add(manga.slug);
    }
    return slugs;
  }, [isUserTab, sourceList, followedSet, seenChapterCounts]);

  const lastReadMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of Object.values(progress)) {
      map[p.mangaSlug] = Math.max(map[p.mangaSlug] ?? 0, p.lastReadAt);
    }
    return map;
  }, [progress]);

  const filtered = useMemo(() => {
    let list = sourceList;
    if (isUserTab) {
      const filterSet = tab === 'favorites' ? favoriteSet : followedSet;
      const slugSource = tab === 'favorites' ? favoriteSlugs : followedSlugs;
      if (list.length === 0) {
        list = slugSource.map((slug) => ({
          slug,
          title: formatMangaSlug(slug),
          coverUrl: '',
          source: 'mangadex' as SourceId,
          language: language as Language,
        }));
      } else {
        list = list.filter((m) => filterSet.has(m.slug));
      }
      const q = search.trim().toLowerCase();
      if (q) {
        list = list.filter((m) => m.title.toLowerCase().includes(q));
      }
    }
    if (tab === 'all') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (isUserTab && !isSearching) {
      const mode = sortMode;
      if (mode === 'added-recent') {
        const slugArr = tab === 'favorites' ? favoriteSlugs : followedSlugs;
        const idxMap = new Map(slugArr.map((s, i) => [s, i]));
        list = [...list].sort((a, b) => (idxMap.get(a.slug) ?? 999) - (idxMap.get(b.slug) ?? 999));
      } else {
        list = [...list].sort((a, b) => {
          if (mode === 'default' && newSlugs.size > 0) {
            const aNew = newSlugs.has(a.slug) ? 1 : 0;
            const bNew = newSlugs.has(b.slug) ? 1 : 0;
            if (bNew !== aNew) return bNew - aNew;
          }
          switch (mode) {
            case 'last-read':
              return (lastReadMap[b.slug] ?? 0) - (lastReadMap[a.slug] ?? 0);
            case 'alphabetical':
              return a.title.localeCompare(b.title);
            default:
              return a.title.localeCompare(b.title);
          }
        });
      }
    }
    return list;
  }, [sourceList, tab, isUserTab, followedSet, followedSlugs, favoriteSet, favoriteSlugs, sortMode, isSearching, search, language, newSlugs, lastReadMap]);


  const filterKey = `${tab}-${language}-${search}`;
  const [scrollState, setScrollState] = useState({ count: PAGE_SIZE, key: filterKey });

  if (scrollState.key !== filterKey) {
    setScrollState({ count: PAGE_SIZE, key: filterKey });
  }

  const visibleCount = scrollState.count;
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setScrollState((prev) => ({
            ...prev,
            count: Math.min(prev.count + PAGE_SIZE, filtered.length),
          }));
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [filtered.length, visibleCount]);

  const isLatestTab = tab === 'latest-updates' || tab === 'latest-new';
  const loadingLatest = tab === 'latest-updates' ? loadingLatestUpdates : loadingLatestNew;
  const isLoading = searchLoading || (isLatestTab ? loadingLatest : loading);

  return (
    <div className="mx-auto max-w-lg pb-4">
      {/* App Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-cyan/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-cyan">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">InkShelf</h1>
        </div>
        <span className="rounded-lg bg-ink-card px-2.5 py-1 text-[10px] font-medium text-zinc-500 border border-ink-border">
          MangaDex
        </span>
      </div>

      {lastRead && !lastRead.completed && (
        <button
          type="button"
          onClick={() => router.push(`/read/${lastRead.mangaSlug}/${lastRead.chapterSlug}`)}
          className="mx-4 mt-1 mb-4 w-[calc(100%-2rem)] rounded-xl bg-ink-card p-4 text-left transition-all duration-300 hover:bg-ink-surface border border-ink-border hover:border-ink-cyan/20 hover:shadow-[0_0_20px_rgba(0,212,255,0.06)]"
        >
          <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-cyan">
            Continue Reading
          </span>
          <p className="mt-1.5 text-sm font-medium text-white">
            {mangas.find((m) => m.slug === lastRead.mangaSlug)?.title ?? formatMangaSlug(lastRead.mangaSlug)} &mdash; {formatChapterSlug(lastRead.chapterSlug)}
          </p>
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-border">
              <div
                className="h-full rounded-full bg-gradient-to-r from-ink-cyan to-ink-cyan-dim transition-all"
                style={{ width: `${lastRead.scrollPercent * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-medium text-ink-cyan">Continue</span>
          </div>
        </button>
      )}

      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-ink-bg/95 backdrop-blur-sm">
        <div className="flex flex-col gap-3 px-4 pt-2 pb-3">
          {/* Tabs — underline style */}
          <div className="flex gap-0 border-b border-ink-border">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`relative px-3 py-2.5 text-xs font-medium transition-all duration-300 ${
                  tab === t.value
                    ? 'text-ink-cyan'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.label}
                {tab === t.value && (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-full -translate-x-1/2 rounded-full bg-ink-cyan shadow-[0_0_8px_rgba(0,212,255,0.4)]" />
                )}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
              <SearchIcon />
            </div>
            <input
              type="text"
              placeholder="Search comics..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-ink-border bg-ink-card pl-9 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-ink-cyan/40 focus:bg-ink-surface focus:shadow-[0_0_0_3px_rgba(0,212,255,0.08)] transition-all duration-300"
            />
          </div>

          {/* Sort selector — user tabs only */}
          {isUserTab && (
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSortMode(opt.value)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all duration-300 ${
                    sortMode === opt.value
                      ? 'bg-ink-cyan/15 text-ink-cyan border border-ink-cyan/30'
                      : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="px-4">
        {/* Loading — skeleton cards */}
        {isLoading && filtered.length === 0 && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && !isLatestTab && !isSearching && filtered.length === 0 && (
          <div className="rounded-xl bg-red-950/30 border border-red-900/20 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Content */}
        {(!isLoading || filtered.length > 0) && (
          <div className="grid grid-cols-2 gap-3">
            {filtered.slice(0, visibleCount).map((manga, i) => (
              <div key={manga.slug} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}>
                <MangaCard
                  manga={manga}
                  hasNew={isUserTab ? newSlugs.has(manga.slug) : undefined}
                  showRemove={tab === 'my-library'}
                  showChapterInfo={isLatestTab}
                  isFavorite={isUserTab ? favoriteSet.has(manga.slug) : undefined}
                  onToggleFavorite={isUserTab ? toggleFavorite : undefined}
                />
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-2 flex flex-col items-center py-20 text-center animate-fade-in">
                {tab === 'my-library' && !isSearching ? (
                  <>
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-card border border-ink-border">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-zinc-400">Your library is empty</p>
                    <p className="mt-1.5 text-xs text-zinc-600">Start exploring from the Browse tab</p>
                  </>
                ) : tab === 'favorites' && !isSearching ? (
                  <>
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-card border border-ink-border">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-zinc-400">No favorites yet</p>
                    <p className="mt-1.5 text-xs text-zinc-600">Star titles you love to find them here</p>
                  </>
                ) : (
                  <>
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-card border border-ink-border">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </div>
                    <p className="text-sm text-zinc-500">No results found</p>
                  </>
                )}
              </div>
            )}
            {visibleCount < filtered.length && (
              <div ref={sentinelRef} className="col-span-2 flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-ink-border border-t-ink-cyan" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
