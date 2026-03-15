import { create } from 'zustand';
import type { AppSettings, Language, ReadingMode } from '../types';
import { pushSettings } from '../services/api';
import { useUserStore } from './userStore';

interface SettingsState extends AppSettings {
  isHydrated: boolean;
  setReadingMode: (mode: ReadingMode) => void;
  setPrefetchCount: (count: number) => void;
  setAutoNextChapter: (auto: boolean) => void;
  setLanguage: (lang: Language) => void;
  hydrateSettings: (settings: AppSettings) => void;
}

let settingsPushTimer: ReturnType<typeof setTimeout> | null = null;

function getAllSettings(state: SettingsState): AppSettings {
  return {
    readingMode: state.readingMode,
    prefetchCount: state.prefetchCount,
    autoNextChapter: state.autoNextChapter,
    language: state.language,
  };
}

function debouncedSettingsPush() {
  if (settingsPushTimer) clearTimeout(settingsPushTimer);
  settingsPushTimer = setTimeout(() => {
    settingsPushTimer = null;
    const userId = useUserStore.getState().userId;
    if (!userId) return;
    const settings = getAllSettings(useSettingsStore.getState());
    pushSettings(userId, settings).catch(() => {});
  }, 2000);
}

export function flushPendingSettingsPush(): void {
  if (settingsPushTimer) {
    clearTimeout(settingsPushTimer);
    settingsPushTimer = null;
  }
  const userId = useUserStore.getState().userId;
  if (!userId) return;
  const settings = getAllSettings(useSettingsStore.getState());
  fetch(`/api/user/${userId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
    keepalive: true,
  }).catch(() => {});
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  readingMode: 'longstrip',
  prefetchCount: 3,
  autoNextChapter: true,
  language: 'fr' as Language,
  isHydrated: false,

  setReadingMode: (readingMode) => {
    set({ readingMode });
    debouncedSettingsPush();
  },
  setPrefetchCount: (prefetchCount) => {
    set({ prefetchCount });
    debouncedSettingsPush();
  },
  setAutoNextChapter: (autoNextChapter) => {
    set({ autoNextChapter });
    debouncedSettingsPush();
  },
  setLanguage: (language) => {
    set({ language });
    debouncedSettingsPush();
  },
  hydrateSettings: (settings) => {
    set({
      readingMode: settings.readingMode,
      prefetchCount: settings.prefetchCount,
      autoNextChapter: settings.autoNextChapter,
      language: settings.language,
      isHydrated: true,
    });
  },
}));
