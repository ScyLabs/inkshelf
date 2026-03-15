import { create } from 'zustand';
import type { CatalogueEntry } from '../types';
import { fetchMangaChapters } from '../services/api';

interface CatalogueState {
  entries: CatalogueEntry[];
  mangaSlug: string | null;
  loading: boolean;
  error: string | null;
  search: string;
  filterType: 'all' | 'chapter' | 'volume';
  viewMode: 'flat' | 'volumes';
  hideRead: boolean;
  sortOrder: 'asc' | 'desc';
  load: (mangaSlug: string) => Promise<void>;
  setSearch: (q: string) => void;
  setFilterType: (t: 'all' | 'chapter' | 'volume') => void;
  setViewMode: (mode: 'flat' | 'volumes') => void;
  setHideRead: (hide: boolean) => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
}

export const useCatalogueStore = create<CatalogueState>((set, get) => ({
  entries: [],
  mangaSlug: null,
  loading: false,
  error: null,
  search: '',
  filterType: 'all',
  viewMode: 'flat',
  hideRead: true,
  sortOrder: 'asc',

  load: async (mangaSlug: string) => {
    const state = get();
    if (state.mangaSlug === mangaSlug && state.entries.length > 0) return;
    if (state.loading && state.mangaSlug === mangaSlug) return;
    if (state.mangaSlug !== mangaSlug) {
      set({ entries: [], mangaSlug, hideRead: true, sortOrder: 'asc', search: '' });
    }
    set({ loading: true, error: null });
    try {
      const entries = await fetchMangaChapters(mangaSlug);
      if (get().mangaSlug === mangaSlug) {
        set({ entries, loading: false, mangaSlug });
      }
    } catch (e) {
      if (get().mangaSlug === mangaSlug) {
        set({ error: (e as Error).message, loading: false });
      }
    }
  },

  setSearch: (search) => set({ search }),
  setFilterType: (filterType) => set({ filterType }),
  setViewMode: (viewMode) => set({ viewMode }),
  setHideRead: (hideRead) => set({ hideRead }),
  setSortOrder: (sortOrder) => set({ sortOrder }),
}));

/**
 * Partial selector: filters entries by search query and type only.
 * Does NOT filter by hideRead (requires progress state from progressStore).
 * The full filtering logic lives in CataloguePage's `filtered` useMemo.
 */
export function selectFilteredEntries(state: CatalogueState): CatalogueEntry[] {
  const { entries, search, filterType } = state;
  const q = search.toLowerCase();
  return entries.filter(e => {
    if (filterType !== 'all' && e.type !== filterType) return false;
    if (q && !e.label.toLowerCase().includes(q) && !String(e.number).includes(q)) return false;
    return true;
  });
}
