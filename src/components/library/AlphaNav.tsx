'use client';

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

interface AlphaNavProps {
  availableLetters: Set<string>;
  activeLetter: string | null;
  onLetterClick: (letter: string) => void;
}

export default function AlphaNav({ availableLetters, activeLetter, onLetterClick }: AlphaNavProps) {
  return (
    <nav className="fixed right-1 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center rounded-full bg-ink-card/80 backdrop-blur-sm border border-ink-border/50 py-1 px-0.5">
      {LETTERS.map((letter) => {
        const available = availableLetters.has(letter);
        const active = activeLetter === letter;

        return (
          <button
            key={letter}
            type="button"
            disabled={!available}
            onClick={() => onLetterClick(letter)}
            className={`w-5 text-[9px] font-medium leading-tight transition-all duration-150 rounded ${
              active
                ? 'bg-ink-cyan/20 text-ink-cyan'
                : available
                  ? 'text-zinc-500 hover:text-ink-cyan'
                  : 'pointer-events-none text-zinc-800'
            }`}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
