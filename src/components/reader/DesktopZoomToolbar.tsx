'use client';

import { useControls } from 'react-zoom-pan-pinch';

export default function DesktopZoomToolbar() {
  const { zoomIn, zoomOut, resetTransform, centerView } = useControls();

  return (
    <div className="fixed bottom-6 left-1/2 z-50 hidden -translate-x-1/2 md:flex items-center gap-1 rounded-full bg-zinc-900/90 px-2 py-1.5 shadow-lg ring-1 ring-zinc-700/50 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => zoomOut(0.3)}
        className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        title="Zoom out"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => zoomIn(0.3)}
        className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        title="Zoom in"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="11" y1="8" x2="11" y2="14" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </button>
      <div className="mx-1 h-5 w-px bg-zinc-700" />
      <button
        type="button"
        onClick={() => resetTransform()}
        className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
        title="Reset zoom"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          <polyline points="1 4 1 10 7 10" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => centerView(1)}
        className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-orange-500"
        title="Fit to width"
      >
        Fit
      </button>
    </div>
  );
}
