import type { ReadingProgress } from '@/types';

export interface ReadingStats {
  chaptersThisWeek: number;
  chaptersToday: number;
  totalChaptersRead: number;
  totalMangaStarted: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  dailyActivity: { date: string; count: number }[];
  mangaBreakdown: { mangaSlug: string; read: number; total: number }[];
}

export function computeStats(progress: Record<string, ReadingProgress>): ReadingStats {
  const entries = Object.values(progress);

  const now = Date.now();
  const todayStart = getDayStart(now);
  const weekStart = getWeekStart(now);

  const chaptersToday = entries.filter(e => e.lastReadAt >= todayStart).length;
  const chaptersThisWeek = entries.filter(e => e.lastReadAt >= weekStart).length;
  const totalChaptersRead = entries.filter(e => e.completed).length;

  const mangaSlugs = new Set(entries.map(e => e.mangaSlug));
  const totalMangaStarted = mangaSlugs.size;

  const completionRate = entries.length > 0
    ? Math.round((totalChaptersRead / entries.length) * 100)
    : 0;

  const { currentStreak, longestStreak } = computeStreaks(entries, now);
  const dailyActivity = computeDailyActivity(entries, now);

  const mangaMap = new Map<string, { read: number; total: number }>();
  for (const e of entries) {
    const existing = mangaMap.get(e.mangaSlug) ?? { read: 0, total: 0 };
    existing.total++;
    if (e.completed) existing.read++;
    mangaMap.set(e.mangaSlug, existing);
  }
  const mangaBreakdown = [...mangaMap.entries()].map(([mangaSlug, data]) => ({
    mangaSlug,
    ...data,
  }));

  return {
    chaptersThisWeek,
    chaptersToday,
    totalChaptersRead,
    totalMangaStarted,
    completionRate,
    currentStreak,
    longestStreak,
    dailyActivity,
    mangaBreakdown,
  };
}

export function getDayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function getWeekStart(now: number): number {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function computeDailyActivity(
  entries: ReadingProgress[],
  now: number,
): { date: string; count: number }[] {
  const result: { date: string; count: number }[] = [];
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const dayMap = new Map<string, number>();
  for (const e of entries) {
    if (e.lastReadAt >= thirtyDaysAgo) {
      const dateStr = new Date(e.lastReadAt).toISOString().slice(0, 10);
      dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + 1);
    }
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    result.push({ date: dateStr, count: dayMap.get(dateStr) ?? 0 });
  }

  return result;
}

function computeStreaks(
  entries: ReadingProgress[],
  now: number,
): { currentStreak: number; longestStreak: number } {
  if (entries.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const activeDays = new Set<string>();
  for (const e of entries) {
    activeDays.add(new Date(e.lastReadAt).toISOString().slice(0, 10));
  }

  const sortedDays = [...activeDays].sort();
  if (sortedDays.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let longestStreak = 1;
  let currentRun = 1;

  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diffDays = Math.round(
      (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (diffDays === 1) {
      currentRun++;
      longestStreak = Math.max(longestStreak, currentRun);
    } else {
      currentRun = 1;
    }
  }

  const today = new Date(now).toISOString().slice(0, 10);
  const yesterday = new Date(now - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const lastActiveDay = sortedDays[sortedDays.length - 1];

  let currentStreak = 0;
  if (lastActiveDay === today || lastActiveDay === yesterday) {
    currentStreak = currentRun;
  }

  return { currentStreak, longestStreak };
}
