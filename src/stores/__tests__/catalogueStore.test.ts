import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCatalogueStore, selectFilteredEntries } from '../catalogueStore';

vi.mock('../../services/api', () => ({
  fetchMangaChapters: vi.fn(),
}));

import { fetchMangaChapters } from '../../services/api';
const mockFetch = vi.mocked(fetchMangaChapters);

const ENTRIES = [
  { slug: 'chapitre-1', label: 'Chapitre 1', type: 'chapter' as const, number: 1, mangaSlug: 'one_piece', source: 'scanvf' as const },
  { slug: 'chapitre-2', label: 'Chapitre 2', type: 'chapter' as const, number: 2, mangaSlug: 'one_piece', source: 'scanvf' as const },
];

describe('catalogueStore', () => {
  beforeEach(() => {
    useCatalogueStore.setState({
      entries: [],
      mangaSlug: null,
      loading: false,
      error: null,
      search: '',
      filterType: 'all',
      viewMode: 'flat',
    });
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('fetches chapters for a manga', async () => {
      mockFetch.mockResolvedValue(ENTRIES);

      await useCatalogueStore.getState().load('one_piece');

      const state = useCatalogueStore.getState();
      expect(state.entries).toEqual(ENTRIES);
      expect(state.mangaSlug).toBe('one_piece');
      expect(state.loading).toBe(false);
    });

    it('skips fetch if same manga already loaded', async () => {
      useCatalogueStore.setState({ entries: ENTRIES, mangaSlug: 'one_piece' });

      await useCatalogueStore.getState().load('one_piece');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('resets entries when switching manga', async () => {
      useCatalogueStore.setState({ entries: ENTRIES, mangaSlug: 'one_piece' });
      mockFetch.mockResolvedValue([]);

      await useCatalogueStore.getState().load('naruto');

      expect(useCatalogueStore.getState().mangaSlug).toBe('naruto');
    });

    it('sets error on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Failed'));

      await useCatalogueStore.getState().load('one_piece');

      expect(useCatalogueStore.getState().error).toBe('Failed');
    });
  });

  describe('selectFilteredEntries', () => {
    it('returns all entries with no filter', () => {
      const state = { ...useCatalogueStore.getState(), entries: ENTRIES };
      expect(selectFilteredEntries(state)).toEqual(ENTRIES);
    });

    it('filters by search query', () => {
      const state = { ...useCatalogueStore.getState(), entries: ENTRIES, search: '2' };
      const filtered = selectFilteredEntries(state);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].slug).toBe('chapitre-2');
    });
  });

  describe('setViewMode', () => {
    it('switches view mode', () => {
      useCatalogueStore.getState().setViewMode('volumes');
      expect(useCatalogueStore.getState().viewMode).toBe('volumes');
    });
  });
});
