import { create } from 'zustand';
import type { Language, MangaListItem } from '../types';
import { fetchMangaList, fetchLatestMangas, searchMangas } from '../services/api';

export type SortMode = 'default' | 'alphabetical' | 'last-read' | 'added-recent';

interface LibraryState {
  mangas: MangaListItem[];
  loading: boolean;
  error: string | null;
  search: string;
  searchResults: MangaListItem[];
  searchLoading: boolean;
  loadedLang: Language | null;
  latestUpdates: MangaListItem[];
  latestNew: MangaListItem[];
  loadingLatestUpdates: boolean;
  loadingLatestNew: boolean;
  sortMode: SortMode;
  load: (lang: Language) => Promise<void>;
  loadLatest: (type: 'updates' | 'new', lang: Language) => Promise<void>;
  setSearch: (q: string) => void;
  doSearch: (q: string, lang: Language) => Promise<void>;
  setSortMode: (mode: SortMode) => void;
  reset: () => void;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchId = 0;
let loadingLang: Language | null = null;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  mangas: [],
  loading: false,
  error: null,
  search: '',
  searchResults: [],
  searchLoading: false,
  loadedLang: null,
  latestUpdates: [],
  latestNew: [],
  loadingLatestUpdates: false,
  loadingLatestNew: false,
  sortMode: 'default',

  load: async (lang) => {
    const { loadedLang, mangas } = get();
    // Skip only if already loaded for this exact language with data
    if (mangas.length > 0 && loadedLang === lang) return;
    // If already loading this same language, skip
    if (loadingLang === lang) return;

    loadingLang = lang;
    set({ loading: true, error: null });
    if (loadedLang !== lang) {
      set({ mangas: [] });
    }
    try {
      const fetched = await fetchMangaList(lang);
      // Only apply if this is still the requested language
      if (loadingLang === lang) {
        set({ mangas: fetched, loading: false, loadedLang: lang });
      }
    } catch (e) {
      if (loadingLang === lang) {
        set({ error: (e as Error).message, loading: false });
      }
    } finally {
      if (loadingLang === lang) {
        loadingLang = null;
      }
    }
  },

  loadLatest: async (type, lang) => {
    const loadingKey = type === 'updates' ? 'loadingLatestUpdates' : 'loadingLatestNew';
    if (get()[loadingKey]) return;

    set({ [loadingKey]: true });
    try {
      const fetched = await fetchLatestMangas(lang, type);
      if (type === 'updates') {
        set({ latestUpdates: fetched, loadingLatestUpdates: false });
      } else {
        set({ latestNew: fetched, loadingLatestNew: false });
      }
    } catch {
      set({ [loadingKey]: false });
    }
  },

  setSearch: (search) => set({ search }),

  doSearch: async (q, lang) => {
    if (searchTimer) clearTimeout(searchTimer);
    const currentId = ++searchId;
    if (!q.trim()) {
      set({ searchResults: [], searchLoading: false });
      return;
    }
    set({ searchLoading: true });
    searchTimer = setTimeout(async () => {
      try {
        const results = await searchMangas(q, lang);
        if (currentId === searchId) {
          set({ searchResults: results, searchLoading: false });
        }
      } catch {
        if (currentId === searchId) {
          set({ searchLoading: false });
        }
      }
    }, 300);
  },

  setSortMode: (sortMode) => set({ sortMode }),
  reset: () => {
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
    searchId++;
    loadingLang = null;
    set({ mangas: [], latestUpdates: [], latestNew: [], loadedLang: null, search: '', searchResults: [], searchLoading: false, sortMode: 'default', error: null, loading: false });
  },
}));
