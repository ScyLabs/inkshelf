import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '../settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      readingMode: 'longstrip',
      prefetchCount: 3,
      autoNextChapter: true,
      language: 'fr',
      isHydrated: false,
    });
  });

  it('has correct defaults', () => {
    const state = useSettingsStore.getState();
    expect(state.readingMode).toBe('longstrip');
    expect(state.prefetchCount).toBe(3);
    expect(state.autoNextChapter).toBe(true);
    expect(state.language).toBe('fr');
    expect(state.isHydrated).toBe(false);
  });

  it('setReadingMode updates reading mode', () => {
    useSettingsStore.getState().setReadingMode('paged');
    expect(useSettingsStore.getState().readingMode).toBe('paged');
  });

  it('setPrefetchCount updates prefetch count', () => {
    useSettingsStore.getState().setPrefetchCount(5);
    expect(useSettingsStore.getState().prefetchCount).toBe(5);
  });

  it('setAutoNextChapter updates auto next chapter', () => {
    useSettingsStore.getState().setAutoNextChapter(false);
    expect(useSettingsStore.getState().autoNextChapter).toBe(false);
  });

  it('setLanguage updates language', () => {
    useSettingsStore.getState().setLanguage('en');
    expect(useSettingsStore.getState().language).toBe('en');
  });

  describe('hydrateSettings', () => {
    it('sets all fields and marks isHydrated', () => {
      useSettingsStore.getState().hydrateSettings({
        readingMode: 'paged',
        prefetchCount: 5,
        autoNextChapter: false,
        language: 'en',
      });
      const state = useSettingsStore.getState();
      expect(state.readingMode).toBe('paged');
      expect(state.prefetchCount).toBe(5);
      expect(state.autoNextChapter).toBe(false);
      expect(state.language).toBe('en');
      expect(state.isHydrated).toBe(true);
    });
  });
});
