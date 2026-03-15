'use client';

import { useMemo } from 'react';
import { useProgressStore } from '@/stores/progressStore';
import { computeStats } from '@/lib/stats';

export default function StatsPanel() {
  const progress = useProgressStore((s) => s.progress);

  const stats = useMemo(() => computeStats(progress), [progress]);

  const maxActivity = Math.max(...stats.dailyActivity.map((d) => d.count), 1);

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <h2 className="mb-3 text-sm font-semibold text-white">Reading Stats</h2>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatBox label="This Week" value={stats.chaptersThisWeek} />
        <StatBox label="Today" value={stats.chaptersToday} />
        <StatBox label="Total Read" value={stats.totalChaptersRead} />
        <StatBox label="Manga" value={stats.totalMangaStarted} />
        <StatBox label="Completion" value={`${stats.completionRate}%`} />
        <StatBox label="Streak" value={`${stats.currentStreak}d`} />
      </div>

      <p className="mb-2 text-xs text-zinc-400">Last 30 days</p>
      <div className="flex h-12 items-end gap-px">
        {stats.dailyActivity.map((day) => (
          <div
            key={day.date}
            className={`flex-1 rounded-sm ${day.count > 0 ? 'bg-orange-500' : 'bg-zinc-700'}`}
            style={{
              height:
                day.count > 0
                  ? `${Math.max(20, (day.count / maxActivity) * 100)}%`
                  : '4px',
            }}
            title={`${day.date}: ${day.count} chapters`}
          />
        ))}
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-zinc-800 p-2 text-center">
      <p className="text-lg font-bold text-orange-500">{value}</p>
      <p className="text-xs text-zinc-400">{label}</p>
    </div>
  );
}
