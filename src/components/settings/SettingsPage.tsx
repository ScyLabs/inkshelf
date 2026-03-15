'use client';

import Link from 'next/link';
import { useSettingsStore } from '../../stores/settingsStore';
import { useDownloadStore } from '../../stores/downloadStore';
import NotificationsPanel from './NotificationsPanel';
import StatsPanel from './StatsPanel';
import SyncPanel from './SyncPanel';
import UserIdPanel from './UserIdPanel';
import SharePanel from './SharePanel';
import type { ReadingMode } from '../../types';

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl bg-ink-card p-4 border border-ink-border"
    >
      <span className="text-sm text-white">{label}</span>
      <div
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-ink-cyan' : 'bg-zinc-700'
        }`}
      >
        <div
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );
}

const MODES: { value: ReadingMode; label: string }[] = [
  { value: 'longstrip', label: 'Long Strip' },
  { value: 'paged', label: 'Page by Page' },
];

export default function SettingsPage() {
  const readingMode = useSettingsStore((s) => s.readingMode);
  const setReadingMode = useSettingsStore((s) => s.setReadingMode);
  const prefetchCount = useSettingsStore((s) => s.prefetchCount);
  const setPrefetchCount = useSettingsStore((s) => s.setPrefetchCount);
  const autoNextChapter = useSettingsStore((s) => s.autoNextChapter);
  const setAutoNextChapter = useSettingsStore((s) => s.setAutoNextChapter);
  const downloadCount = useDownloadStore((s) => Object.keys(s.downloaded).length);

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-4">
      <h1 className="mb-4 text-xl font-bold text-white">Settings</h1>

      <div className="flex flex-col gap-3">
        {/* Reading mode */}
        <div className="rounded-xl bg-ink-card p-4 border border-ink-border">
          <p className="mb-2 text-sm text-white">Reading Mode</p>
          <div className="flex gap-1 rounded-lg bg-ink-surface p-1 border border-ink-border">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setReadingMode(m.value)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  readingMode === m.value
                    ? 'bg-ink-cyan/15 text-ink-cyan'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <Toggle
          label="Prefetch next chapter"
          checked={prefetchCount > 0}
          onChange={(v) => setPrefetchCount(v ? 3 : 0)}
        />

        <Toggle
          label="Auto-next chapter"
          checked={autoNextChapter}
          onChange={setAutoNextChapter}
        />

        {/* Downloads */}
        <Link href="/downloads" className="flex items-center justify-between rounded-xl bg-ink-card p-4 border border-ink-border">
          <div className="flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <div>
              <p className="text-sm text-white">Downloads</p>
              <p className="text-xs text-zinc-500">{downloadCount} chapter{downloadCount !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>

        <SharePanel />
        <NotificationsPanel />
        <StatsPanel />
        <UserIdPanel />
        <SyncPanel />
      </div>
    </div>
  );
}
