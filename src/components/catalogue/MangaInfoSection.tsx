'use client';

import { useState } from 'react';
import type { MangaInfo } from '../../types';

interface MangaInfoSectionProps {
  info: MangaInfo | null;
  isLoading: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ongoing: { bg: 'bg-green-500/10', text: 'text-green-400' },
  completed: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  hiatus: { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
  cancelled: { bg: 'bg-red-500/10', text: 'text-red-400' },
};

export default function MangaInfoSection({ info, isLoading }: MangaInfoSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="mb-4 animate-pulse rounded-xl bg-zinc-900 p-4">
        <div className="mb-3 h-4 w-20 rounded bg-zinc-800" />
        <div className="mb-2 h-3 w-48 rounded bg-zinc-800" />
        <div className="mb-2 h-3 w-full rounded bg-zinc-800" />
        <div className="h-3 w-3/4 rounded bg-zinc-800" />
      </div>
    );
  }

  if (!info || (!info.synopsis && !info.author && !info.status && info.genres.length === 0)) {
    return null;
  }

  const statusColors = info.status ? STATUS_COLORS[info.status] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-400' } : null;

  return (
    <div className="mb-4 rounded-xl bg-zinc-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {info.status && statusColors && (
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${statusColors.bg} ${statusColors.text}`}>
            {info.status}
          </span>
        )}
        {info.author && (
          <span className="text-xs text-zinc-400">
            by {info.author}{info.artist && info.artist !== info.author ? ` / ${info.artist}` : ''}
          </span>
        )}
      </div>

      {info.synopsis && (
        <div className="mt-3">
          <p className={`text-xs text-zinc-400 ${expanded ? '' : 'line-clamp-3'}`}>
            {info.synopsis}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs font-medium text-orange-500"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}

      {info.genres.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {info.genres.map((genre) => (
            <span key={genre} className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
              {genre}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
