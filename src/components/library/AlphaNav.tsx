'use client';

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

interface AlphaNavProps {
  availableLetters: Set<string>;
  activeLetter: string | null;
  onLetterClick: (letter: string) => void;
}

export default function AlphaNav({ availableLetters, activeLetter, onLetterClick }: AlphaNavProps) {
  return (
    <nav className="fixed right-1 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center">
      {LETTERS.map((letter) => {
        const available = availableLetters.has(letter);
        const active = activeLetter === letter;

        return (
          <button
            key={letter}
            type="button"
            disabled={!available}
            onClick={() => onLetterClick(letter)}
            className={`w-5 text-[9px] font-medium leading-tight transition-colors ${
              active
                ? 'rounded bg-orange-500 text-white'
                : available
                  ? 'text-zinc-400 hover:text-orange-500'
                  : 'pointer-events-none text-zinc-700'
            }`}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
