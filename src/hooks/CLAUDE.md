# src/hooks/ - Custom React Hooks

3 hooks spécialisés pour le lecteur manga.

## Structure
```
hooks/
├── useChapter.ts         # Fetch données chapitre
├── useReadingProgress.ts # Sauvegarde progression debounced
└── usePrefetch.ts        # Prefetch prochain chapitre
```

## useChapter.ts
**Purpose**: Fetch et gestion des données d'un chapitre.
**Params**: `mangaSlug: string, chapterSlug: string`
**Returns**: `{ chapter: ChapterData | null, isLoading: boolean, error: string | null }`

- Flag de cancellation pour éviter les updates après unmount
- Reset du state quand les deps changent
- Appel `fetchMangaChapter()` du service API

## useReadingProgress.ts (CRITIQUE pour le reader)
**Purpose**: Auto-save de la position de lecture avec debouncing.
**Params**: `mangaSlug: string, chapterSlug: string, totalPages: number`
**Returns**: `{ currentPageRef: RefObject, setCurrentPage: (page) => void, saveProgress: () => void }`

- `currentPageRef` → Ref mutable (pas de re-render à chaque changement de page)
- `setCurrentPage(page)` → Update ref + trigger debounced save (2000ms)
- `saveProgress()` → Calcul scrollPercent + update store immédiat
- **Scroll tracking**: `container.scrollTop / (scrollHeight - clientHeight)`
- **Cleanup**: Flush le pending save au unmount

**Pattern important**: Utilise des refs plutôt que useState pour la page courante afin d'éviter les re-renders inutiles du composant reader lors du scroll.

## usePrefetch.ts
**Purpose**: Prefetch les images du prochain chapitre pendant la lecture.
**Params**: `nextSlug: string | null, mangaSlug: string, currentPage: number, totalPages: number`

**Trigger**: Quand `currentPage / totalPages >= 0.8` (80% du chapitre lu)
- Cache du slug prefetché pour éviter les doublons
- Prefetch des 3 premières images du prochain chapitre (objets `Image`)
- Échoue silencieusement sans impact sur la lecture
- Ne se déclenche que si `totalPages > 0` et `nextSlug` existe
