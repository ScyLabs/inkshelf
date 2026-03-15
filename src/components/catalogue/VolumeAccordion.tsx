'use client';

import { useState } from 'react';
import type { VolumeGroup, ReadingProgress } from '../../types';
import ChapterCard from './ChapterCard';

interface VolumeAccordionProps {
  group: VolumeGroup;
  mangaSlug: string;
  progress: Record<string, ReadingProgress>;
  batchMode?: boolean;
  onBatchMark?: (slug: string) => void;
}

export default function VolumeAccordion({ group, mangaSlug, progress, batchMode, onBatchMark }: VolumeAccordionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl bg-zinc-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-zinc-800"
      >
        <div>
          <p className="text-sm font-medium text-white">{group.label}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {group.chapters.length} chapter{group.chapters.length !== 1 ? 's' : ''}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          {group.chapters.map((entry) => (
            <ChapterCard
              key={entry.slug}
              entry={entry}
              mangaSlug={mangaSlug}
              progress={progress[`${mangaSlug}/${entry.slug}`]}
              batchMode={batchMode}
              onBatchMark={onBatchMark}
            />
          ))}
        </div>
      )}
    </div>
  );
}
