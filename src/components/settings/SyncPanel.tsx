'use client';

import { useState } from 'react';
import { useProgressStore } from '../../stores/progressStore';
import { useUserStore } from '../../stores/userStore';

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export default function SyncPanel() {
  const progress = useProgressStore((s) => s.progress);
  const hydrateFromServer = useProgressStore((s) => s.hydrateFromServer);
  const lastSyncedAt = useProgressStore((s) => s.lastSyncedAt);
  const userId = useUserStore((s) => s.userId);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  const chapterCount = Object.keys(progress).length;

  async function handleSync() {
    if (!userId) { setSyncStatus('error'); return; }
    setSyncStatus('syncing');
    try {
      await hydrateFromServer(userId);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
    }
  }

  const syncLabel =
    syncStatus === 'syncing' ? 'Syncing...' :
    syncStatus === 'synced' ? 'Synced' :
    syncStatus === 'error' ? 'Sync Failed' :
    'Sync Now';

  return (
    <div className="rounded-xl bg-ink-card p-4 border border-ink-border">
      <h3 className="text-sm font-semibold text-white">Sync Progress</h3>
      <p className="mt-1 text-xs text-zinc-500">
        {chapterCount} chapter{chapterCount !== 1 ? 's' : ''} tracked
        {' '}&mdash; auto-sync on every read
      </p>
      {lastSyncedAt && (
        <p className="mt-1 text-xs text-zinc-600">
          Last synced: {new Date(lastSyncedAt).toLocaleString()}
        </p>
      )}
      <p className="mt-2 text-xs text-zinc-500">
        All data synced via your UUID.
      </p>

      <div className="mt-3">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncStatus === 'syncing'}
          className={`w-full rounded-xl px-3 py-2.5 text-xs font-medium text-white transition-all duration-200 ${
            syncStatus === 'syncing'
              ? 'bg-zinc-700 cursor-not-allowed'
              : syncStatus === 'error'
                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                : syncStatus === 'synced'
                  ? 'bg-green-600 hover:bg-green-700 active:bg-green-800'
                  : 'bg-ink-cyan text-ink-bg hover:bg-ink-cyan-dim'
          }`}
        >
          {syncLabel}
        </button>
      </div>
    </div>
  );
}
