'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLibraryStore, type SortMode } from '../../stores/libraryStore';
import { useProgressStore } from '../../stores/progressStore';
import { useSettingsStore } from '../../stores/settingsStore';
import MangaCard from './MangaCard';
import AlphaNav from './AlphaNav';
import type { Language, MangaListItem, SourceId } from '../../types';
import { formatMangaSlug, formatChapterSlug } from '../../lib/format';

const PAGE_SIZE = 20;

type Tab = 'my-library' | 'favorites' | 'all' | 'latest-updates' | 'latest-new';

const TABS: { value: Tab; label: string }[] = [
  { value: 'my-library', label: 'My Library' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'all', label: 'All' },
  { value: 'latest-updates', label: 'Derni\u00e8res MAJ' },
  { value: 'latest-new', label: 'New Releases' },
];

const VALID_TABS = new Set(TABS.map(t => t.value));

const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'fr', label: 'FR' },
  { value: 'en', label: 'EN' },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'default', label: 'Newest' },
  { value: 'last-read', label: 'Last Read' },
  { value: 'added-recent', label: 'Ajout r\u00e9cent' },
  { value: 'alphabetical', label: 'A-Z' },
];

function ChevronIcon({ up }: { up: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-200 ${up ? '' : 'rotate-180'}`}
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function getLetterKey(title: string): string {
  const first = title.charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
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
  const setLanguage = useSettingsStore((s) => s.setLanguage);

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

  // Load latest data when switching to latest tabs
  useEffect(() => {
    if (tab === 'latest-updates') {
      loadLatest('updates', language);
    } else if (tab === 'latest-new') {
      loadLatest('new', language);
    }
  }, [tab, language, loadLatest]);

  // Server-side search (debounced) — skip for user tabs (local filtering)
  useEffect(() => {
    if (!isUserTab) doSearch(search, language);
  }, [search, language, doSearch, isUserTab]);

  const isSearching = search.trim().length > 0;
  const isServerSearching = isSearching && !isUserTab;

  // Determine source list based on tab
  const sourceList = useMemo((): MangaListItem[] => {
    if (isServerSearching) return searchResults;
    if (tab === 'latest-updates') return latestUpdates;
    if (tab === 'latest-new') return latestNew;
    return mangas;
  }, [tab, mangas, latestUpdates, latestNew, isServerSearching, searchResults]);

  // Bootstrap: initialize seenChapterCounts for existing follows that lack an entry
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

  // "NEW" badge detection for library/favorites tabs (must be before filtered for sort)
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
        // Catalogue not loaded yet — build minimal items from slugs
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
      // Local title search for user tabs
      const q = search.trim().toLowerCase();
      if (q) {
        list = list.filter((m) => m.title.toLowerCase().includes(q));
      }
    }
    // Sorting
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


  // Infinite scroll: render in batches of PAGE_SIZE
  const filterKey = `${tab}-${language}-${search}`;
  const [scrollState, setScrollState] = useState({ count: PAGE_SIZE, key: filterKey });

  // Reset when filters change (adjust state during render — React recommended pattern)
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

  // Alphabetical grouping for "all" tab (sliced for infinite scroll)
  const letterGroups = useMemo(() => {
    if (tab !== 'all') return null;
    const sliced = filtered.slice(0, visibleCount);
    const groups: { letter: string; mangas: MangaListItem[] }[] = [];
    let currentLetter = '';
    for (const manga of sliced) {
      const letter = getLetterKey(manga.title);
      if (letter !== currentLetter) {
        currentLetter = letter;
        groups.push({ letter, mangas: [] });
      }
      groups[groups.length - 1].mangas.push(manga);
    }
    return groups;
  }, [tab, filtered, visibleCount]);

  const availableLetters = useMemo(() => {
    if (!letterGroups) return new Set<string>();
    return new Set(letterGroups.map((g) => g.letter));
  }, [letterGroups]);

  // Active letter tracking via IntersectionObserver
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const letterRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setLetterRef = useCallback((letter: string, el: HTMLDivElement | null) => {
    if (el) {
      letterRefs.current.set(letter, el);
    } else {
      letterRefs.current.delete(letter);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'all') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const letter = (entry.target as HTMLElement).dataset.letter;
            if (letter) setActiveLetter(letter);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );

    for (const el of letterRefs.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [tab, letterGroups]);

  const handleLetterClick = useCallback((letter: string) => {
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const [headerVisible, setHeaderVisible] = useState(true);

  const isLatestTab = tab === 'latest-updates' || tab === 'latest-new';
  const loadingLatest = tab === 'latest-updates' ? loadingLatestUpdates : loadingLatestNew;
  const isLoading = searchLoading || (isLatestTab ? loadingLatest : loading);

  return (
    <div className="mx-auto max-w-lg pb-4">
      {lastRead && !lastRead.completed && (
        <button
          type="button"
          onClick={() => router.push(`/read/${lastRead.mangaSlug}/${lastRead.chapterSlug}`)}
          className="mx-4 mt-4 mb-4 w-[calc(100%-2rem)] rounded-xl bg-zinc-900 p-4 text-left transition-colors hover:bg-zinc-800 active:bg-zinc-700"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-orange-500">
            Continue Reading
          </span>
          <p className="mt-1 text-sm font-medium text-white">
            {mangas.find((m) => m.slug === lastRead.mangaSlug)?.title ?? formatMangaSlug(lastRead.mangaSlug)} &mdash; {formatChapterSlug(lastRead.chapterSlug)}
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

      {/* Sticky header with toggle */}
      <div className="sticky top-0 z-20 bg-black">
        <div
          className={`overflow-hidden transition-all duration-200 ease-in-out ${
            headerVisible ? 'max-h-64' : 'max-h-0'
          }`}
        >
          <div className="flex flex-col gap-3 px-4 pt-3">
            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-900 p-1 no-scrollbar">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    tab === t.value
                      ? 'bg-orange-500 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Language selector */}
            <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
              {LANGUAGES.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLanguage(l.value)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    language === l.value
                      ? 'bg-orange-500 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search manga..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-orange-500 transition-colors"
            />

            {/* Sort selector — user tabs only */}
            {isUserTab && (
              <div className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-900 p-1 no-scrollbar">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSortMode(opt.value)}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      sortMode === opt.value
                        ? 'bg-orange-500 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Toggle button */}
        <button
          type="button"
          onClick={() => setHeaderVisible((v) => !v)}
          className="flex w-full items-center justify-center py-1.5 text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <ChevronIcon up={headerVisible} />
        </button>
      </div>

      {/* Content area */}
      <div className="px-4">
        {/* Loading — only show spinner if no data to display yet */}
        {isLoading && filtered.length === 0 && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />
          </div>
        )}

        {/* Error — only show if no data available */}
        {error && !isLatestTab && !isSearching && filtered.length === 0 && (
          <div className="rounded-lg bg-red-950 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Content — show whenever we have data or loading is done */}
        {(!isLoading || filtered.length > 0) && (
          <>
            {/* Alphabetical "all" tab with letter groups */}
            {tab === 'all' && letterGroups ? (
              <div className="relative">
                <AlphaNav
                  availableLetters={availableLetters}
                  activeLetter={activeLetter}
                  onLetterClick={handleLetterClick}
                />
                <div className="pr-6">
                  {letterGroups.map((group) => (
                    <div key={group.letter}>
                      <div
                        id={`letter-${group.letter}`}
                        data-letter={group.letter}
                        ref={(el) => setLetterRef(group.letter, el)}
                        className="sticky top-8 z-10 bg-black/80 py-1.5 backdrop-blur-sm"
                      >
                        <span className="text-xs font-bold text-orange-500">
                          {group.letter}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pb-2">
                        {group.mangas.map((manga) => (
                          <MangaCard key={manga.slug} manga={manga} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <p className="py-8 text-center text-sm text-zinc-500">
                      No manga found.
                    </p>
                  )}
                  {visibleCount < filtered.length && (
                    <div ref={sentinelRef} className="flex justify-center py-4">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Standard grid for other tabs */
              <div className="grid grid-cols-2 gap-3">
                {filtered.slice(0, visibleCount).map((manga) => (
                  <MangaCard
                    key={manga.slug}
                    manga={manga}
                    hasNew={isUserTab ? newSlugs.has(manga.slug) : undefined}
                    showRemove={tab === 'my-library'}
                    showChapterInfo={isLatestTab}
                    isFavorite={isUserTab ? favoriteSet.has(manga.slug) : undefined}
                    onToggleFavorite={isUserTab ? toggleFavorite : undefined}
                  />
                ))}
                {filtered.length === 0 && (
                  <p className="col-span-2 py-8 text-center text-sm text-zinc-500">
                    {tab === 'my-library'
                      ? (isSearching ? 'No results.' : 'No manga started.')
                      : tab === 'favorites'
                        ? (isSearching ? 'No results.' : 'No favorites.')
                        : isLatestTab
                          ? 'No results.'
                          : 'No manga found.'}
                  </p>
                )}
                {visibleCount < filtered.length && (
                  <div ref={sentinelRef} className="col-span-2 flex justify-center py-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
