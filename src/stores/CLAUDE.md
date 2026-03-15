# src/stores/ - State Management (Zustand)

6 stores Zustand pour l'état client et la synchronisation serveur.

## Structure
```
stores/
├── userStore.ts       # Identité utilisateur (UUID)
├── libraryStore.ts    # Catalogue manga, recherche, latest
├── catalogueStore.ts  # Chapitres d'un manga spécifique
├── progressStore.ts   # Progression lecture + sync serveur (LE PLUS COMPLEXE)
├── settingsStore.ts   # Préférences utilisateur
└── downloadStore.ts   # Suivi téléchargements hors-ligne
```

## userStore.ts - Identité
**Persist key**: `manga-reader-user`
**State**:
- `userId: string` - UUID actuel
- `createdAt: number` - Timestamp création
- `knownUsers: Record<string, {lastUseAt}>` - Historique des UUID connus

**Actions**:
- `regenerateId()` → Nouveau UUID + nouveau createdAt
- `setUserId(id)` → Basculer vers un autre UUID
- `updateLastUse(id)` → Met à jour lastUseAt

**Migration**: v1 → v2 (structure knownUsers)

## libraryStore.ts - Catalogue & Recherche
**State**:
- `mangas: MangaListItem[]`, `loading`, `error`
- `search`, `searchResults`, `searchLoading`
- `loadedLang: Language | null` - Langue actuellement chargée
- `latestUpdates`, `latestNew` - Listes latest
- `sortMode: 'default' | 'alphabetical' | 'last-read' | 'added-recent'`

**Actions**:
- `load(lang)` → Charge la liste manga (avec dédup et cache par langue)
- `loadLatest(type, lang)` → Charge latest updates/new
- `doSearch(q, lang)` → Recherche serveur avec debounce 300ms
- `reset()` → Clear all state + cleanup timers

**Anti-patterns évités**:
- Variables module-level pour tracking langue en cours de chargement
- Timer management pour le debounce search
- Request ID tracking pour annuler les recherches périmées

## catalogueStore.ts - Chapitres
**State**:
- `entries: CatalogueEntry[]`, `mangaSlug`, `loading`, `error`
- `search`, `filterType: 'all' | 'chapter' | 'volume'`, `viewMode: 'flat' | 'volumes'`
- `hideRead: boolean` (défaut: true) — masque les chapitres déjà lus
- `sortOrder: 'asc' | 'desc'` (défaut: 'asc') — tri croissant/décroissant

**Actions**:
- `load(mangaSlug)` → Charge les chapitres (cache par slug, reset hideRead/sortOrder/search on manga switch)
- Setters: `setSearch`, `setFilterType`, `setViewMode`, `setHideRead`, `setSortOrder`

**Selector exporté**: `selectFilteredEntries(state)` → Filtre partiel par search + type uniquement (ne filtre PAS par hideRead, qui nécessite progress du progressStore). Le filtrage complet est dans le useMemo de CataloguePage.

## progressStore.ts - Progression (LE PLUS COMPLEXE)
**Persist key**: `manga-reader-progress`
**State**:
- `progress: Record<key, ReadingProgress>` - Clé: `"mangaSlug/chapterSlug"`
- `followedSlugs: string[]` - Mangas suivis (bibliothèque)
- `favoriteSlugs: string[]` - Mangas favoris (sous-ensemble de followedSlugs), persisté via localStorage
- `isHydrated: boolean` - Sync serveur terminée
- `lastSyncedAt: number` - Dernier sync timestamp
- `seenChapterCounts: Record<string, number>` - Cache comptage chapitres vus

**Actions critiques**:
- `updateProgress(mangaSlug, chapterSlug, update)` → Update local + debounce push serveur 5000ms
- `markCompleted(mangaSlug, chapterSlug)` → Flag completed
- `getLastRead()` / `getLastReadForManga(mangaSlug)` → Dernier chapitre lu
- `getMangaProgress(mangaSlug)` → Toute la progression d'un manga
- `markBatchCompleted(mangaSlug, chapterSlugs[])` → Marque N chapitres comme lus en batch (optimistic + auto-follow + push serveur)
- `toggleFavorite(mangaSlug)` → Toggle favori (optimistic + push serveur)
- `followManga(slug)` / `unfollowManga(slug)` → Gestion bibliothèque (unfollow nettoie aussi les favoris)
- `hydrateFromServer(userId)` → Charge + merge état serveur (1 fois au boot)
- `syncFromServer(userId)` / `syncToServer(userId)` → Sync complète

**Variables module-level** (hors du store Zustand):
- `pushTimer` - Timer de debounce pour les push serveur
- `pendingPush` - Progression en attente d'envoi
- `pendingLibraryAdds: Set<string>` - Follows non confirmés
- `pendingFavoriteActions: Map<string, 'favorite' | 'unfavorite'>` - Favoris non confirmés
- `initialHydrationDone: boolean` - Flag hydration settings
- `resetPendingState()` - Helper de test pour reset
- `SEEN_COUNTS_KEY` / `FAVORITE_SLUGS_KEY` - Clés localStorage
- `loadSeenCounts()` / `saveSeenCounts()` - Persistence manuelle localStorage pour badge "NEW"
- `loadFavoriteSlugs()` / `saveFavoriteSlugs()` - Persistence manuelle localStorage pour favoris
- `PROGRESS_CACHE_KEY` / `FOLLOWED_SLUGS_KEY` - Clés localStorage pour progress cache et followedSlugs
- `loadProgressCache()` / `saveProgressCache()` - Persistence manuelle localStorage pour progress (instant state on refresh)
- `loadFollowedSlugs()` / `saveFollowedSlugs()` - Persistence manuelle localStorage pour followedSlugs
- `pollTimer` - Timer d'intervalle pour le polling sync cross-device (30s)
- `isPollingSyncing` - Guard contre les polls concurrents
- `POLL_INTERVAL_MS = 30_000` - Intervalle de polling
- `startSyncPolling(userId)` / `stopSyncPolling()` - Démarrage/arrêt du polling sync

**Badge "NEW" (seenChapterCounts)**:
- `seenChapterCounts: Record<string, number>` — comptage chapitres vus par manga, persisté via localStorage (`manga-seen-counts`)
- `setSeenChapterCount(slug, count)` — met à jour + sauvegarde localStorage
- Initialisé via `loadSeenCounts()` au démarrage (SSR-safe avec `typeof window` check)
- Nettoyé dans `unfollowManga()` pour éviter les données stales
- Détection: `knownChapterCount > seenChapterCounts[slug]` → badge "NEW"
- Bootstrap: LibraryPage initialise les follows existants sans entry à `knownChapterCount`
- Set "seen": CataloguePage met à jour quand les chapitres sont chargés (Math.max pour ne jamais diminuer)

**Favoris (favoriteSlugs)**:
- `favoriteSlugs: string[]` — sous-ensemble de `followedSlugs`, persisté via localStorage (`manga-favorite-slugs`)
- `toggleFavorite(mangaSlug)` — toggle optimiste (state + localStorage) puis push serveur via `pushLibraryAction(userId, 'favorite'|'unfavorite', slug)`
- Race-safe: lecture de `isFav` à l'intérieur du callback `set()` pour éviter les double-taps
- `pendingFavoriteActions: Map<string, action>` — tracking des favoris non confirmés par le serveur
- Nettoyé dans `unfollowManga()` pour maintenir le sous-ensemble
- Hydration: serveur = source de vérité, overlay des pending locaux, filtré contre la bibliothèque mergée
- Pruning: après hydration, les pending déjà reflétés sur le serveur sont supprimés
- Flush: `flushPendingPush()` envoie les pending favorite actions avec `keepalive: true`
- DB: colonne `is_favorite INTEGER DEFAULT 0` sur `user_library` (migration v7)
- API: PATCH `/api/user/[userId]/library` avec action `favorite`/`unfavorite`

**Stratégie de sync (cross-device)**:
1. Au boot: `hydrateFromServer()` → merge local/serveur par lastReadAt → `startSyncPolling(userId)`
2. À chaque update: debounce 5000ms → `pushSingleProgress()` API + `saveProgressCache()` localStorage
3. Sur visibilitychange hidden: `stopSyncPolling()` + `flushPendingPush()` avec `keepalive: true`
4. Sur visibilitychange visible: `hydrateFromServer()` → `startSyncPolling(userId)` (chained, with fallback start on error)
5. Polling cross-device (30s): `fetchSyncCheck(userId)` → compare `lastUseAt > lastSyncedAt` → conditionally `hydrateFromServer()`. Lightweight endpoint (~50 bytes) avoids heavy full-state polling.
6. Pending library adds: tracking séparé pour gérer les follows avant confirmation serveur
7. Merge logic: incoming wins si `lastReadAt` plus récent OU si absent côté serveur
8. localStorage persistence: `progress` et `followedSlugs` persistés manuellement (même pattern que `favoriteSlugs`/`seenCounts`). Permet un état instantané au refresh sans attendre le serveur.
9. Sur userId change: `stopSyncPolling()` → flush → reset → `hydrateFromServer()` → `startSyncPolling(newUserId)`

## settingsStore.ts - Préférences
**Persist key**: `manga-reader-settings`
**State**:
- `readingMode: 'longstrip' | 'paged'` (défaut: longstrip)
- `prefetchCount: number` (défaut: 3, range 0-20)
- `autoNextChapter: boolean` (défaut: true)
- `language: 'fr' | 'en'` (défaut: 'fr')
- `isHydrated: boolean`

**Actions**:
- Setters: `setReadingMode`, `setPrefetchCount`, `setAutoNextChapter`, `setLanguage`
- Chaque setter debounce un push serveur de 2000ms
- `hydrateSettings(settings)` → Charge depuis serveur + flag hydrated
- `flushPendingSettingsPush()` → Flush avec keepalive avant unload

## downloadStore.ts - Téléchargements hors-ligne
**localStorage key**: `manga-downloaded-chapters`
**Pas de persist middleware** — persistence manuelle (même pattern que `seenChapterCounts` dans progressStore)
**Pas de sync serveur** — les téléchargements sont device-local

**State**:
- `downloaded: Record<string, number>` — Clé: `"mangaSlug/chapterSlug"`, valeur: timestamp. **Persisté** dans localStorage.
- `activeDownloads: Record<string, DownloadProgress>` — Progression en cours. **NON persisté** (transient).
- `bulkDownload: BulkDownloadState | null` — État du téléchargement en masse (mangaSlug, totalChapters, completedChapters, currentChapter, error). **NON persisté**.

**Actions**:
- `markDownloaded(mangaSlug, chapterSlug)` → Ajoute à downloaded + sauvegarde localStorage
- `removeDownloaded(mangaSlug, chapterSlug)` → Supprime de downloaded + sauvegarde
- `removeDownloadedWithCache(mangaSlug, chapterSlug)` → Supprime de downloaded + supprime les caches (metadata, images, reader page)
- `clearAllDownloads()` → Supprime tous les téléchargements + tous les caches offline
- `isDownloaded(mangaSlug, chapterSlug)` → Boolean (clé existe dans downloaded)
- `setActiveProgress(mangaSlug, chapterSlug, progress)` → Met à jour la progression active
- `clearActiveProgress(mangaSlug, chapterSlug)` → Supprime la progression active
- `getActiveProgress(mangaSlug, chapterSlug)` → Retourne DownloadProgress | undefined
- `startBulkDownload(mangaSlug, chapterSlugs)` → Filtre les déjà téléchargés, crée AbortController, lance `downloadManga()`, marque chaque chapitre via `markDownloaded()` sur les transitions de chapitre (vérifie succès via `!currentImages.error`)
- `cancelBulkDownload()` → Abort le controller, clear `bulkDownload`

**Variable module-level**: `bulkAbortController: AbortController | null` — même pattern que `pushTimer` dans progressStore

**Type importé**: `DownloadProgress` de `../services/offlineDownload`

**Utilisé par**: `ChapterCard.tsx` (bouton download), `CataloguePage.tsx` (bouton "Tout télécharger")

## Patterns Importants

### Debounce avec variables module-level
```
// Les timers de debounce sont des variables module-level (pas dans le state Zustand)
// car Zustand persiste le state dans localStorage et les timers ne sont pas sérialisables
let pushTimer: ReturnType<typeof setTimeout> | null = null;
```

### Keepalive flush pattern
```
// Avant page close, flush les pending avec keepalive pour garantir l'envoi
fetch(url, { method: 'PUT', body, keepalive: true })
```

### Hydration séquentielle
1. Stores Zustand se hydratent depuis localStorage (immédiat)
2. `hydrateFromServer()` merge avec le serveur (async)
3. `isHydrated = true` → L'UI peut afficher les données
4. Settings hydratés une seule fois (flag `initialHydrationDone`)
