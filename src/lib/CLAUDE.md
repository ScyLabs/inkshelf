# src/lib/ - Backend Libraries

Cœur métier de l'application côté serveur. Contient la base de données, les sources manga, la gestion de progression et utilisateurs.

## Structure
```
lib/
├── db/
│   ├── index.ts      # Connexion PostgreSQL, init DB, migrations
│   ├── schema.ts     # Schéma Drizzle ORM (12 tables)
│   ├── cache.ts      # CRUD cache manga/chapitres/latest
│   └── dedup.ts      # Déduplication cross-source (normalisation titres)
├── sources/
│   ├── types.ts      # Interface MangaSource + types résultats
│   ├── index.ts      # Registry des sources + résolution slug
│   ├── scanvf.ts     # Source française (scan-vf.net)
│   ├── mangapill.ts  # Source anglaise (mangapill.com)
│   ├── mangadex.ts   # Source multilingue (API REST mangadex.org)
│   ├── mgeko.ts      # Source anglaise (mgeko.cc)
│   └── harimanga.ts  # Source anglaise (harimanga.me)
├── progress/
│   └── store.ts      # CRUD progression lecture (server-side)
├── user/
│   └── store.ts      # CRUD bibliothèque + settings (server-side)
├── push/
│   └── index.ts      # Push notifications (saveSubscription, removeSubscription, notifyNewChapters)
├── archive/
│   ├── index.ts       # API publique archive (enqueueArchive, getArchiveStatus, lookupLocalImage)
│   ├── worker.ts      # Worker de téléchargement (FIFO queue, 1 manga/fois, 3 images parallèles)
│   ├── storage.ts     # Opérations filesystem (ensureDir, saveImage, readImage, imageExists)
│   └── pathCache.ts   # Cache in-memory LRU pour mapping URL→path (10k entrées)
├── scraper/
│   └── scheduler.ts  # Planificateur de scraping (intervalle 55min) + hook archive nouveaux chapitres
├── stats.ts           # Statistiques de lecture (computeStats, pure functions)
└── format.ts         # Utilitaires de formatage (slugs, dates relatives FR)
```

## db/ - Base de données

### schema.ts - Tables PostgreSQL (Drizzle ORM)
| Table | Clé primaire | Rôle |
|-------|-------------|------|
| `mangas` | slug | Cache des mangas par source |
| `chapters` | (mangaSlug, slug) | Liste des chapitres par manga |
| `chapterDetails` | (mangaSlug, chapterSlug) | Images + navigation prev/next |
| `readingProgress` | (userId, mangaSlug, chapterSlug) | Position de lecture utilisateur |
| `latestUpdates` | (slug, source) | Dernières mises à jour par source |
| `userMeta` | userId | Métadonnées utilisateur (lastUseAt) |
| `userLibrary` | (userId, mangaSlug) | Mangas suivis par l'utilisateur |
| `userSettings` | userId | Préférences (readingMode, language, etc.) |
| `mangaInfo` | mangaSlug | Métadonnées manga (synopsis, auteur, genres, statut) |
| `pushSubscriptions` | (userId, endpoint) | Abonnements push notifications (p256dh, auth, createdAt) |
| `archiveJobs` | mangaSlug | Suivi archivage par manga (status, progress, error, timestamps) |
| `archiveImages` | originalUrl | Mapping URL→chemin local (mangaSlug, chapterSlug, pageIndex, extension) |

**Convention timestamps**: Tous en epoch seconds stockés en BIGINT.
**Convention status**: 'active' | 'stale' pour invalidation du cache.

### index.ts - Initialisation
- Singleton `getDb()` / `getSql()` pour accès DB
- Pool max 10 connexions
- Création automatique du schéma au premier lancement
- Système de migrations versionné (table `schema_version`, v10 actuelle)
  - v4: Migration int → BIGINT pour timestamps
  - v5: Ajout colonne `sorted_at` sur `latestUpdates`
  - v6: Ajout `known_chapter_count` et `last_chapter_check_at` sur `mangas` + bootstrap seed
  - v7: Ajout colonne `is_favorite` sur `userLibrary`
  - v8: Création table `manga_info` (synopsis, author, artist, genres, status, fetchedAt)
  - v9: Création table `push_subscriptions` (userId, endpoint, p256dh, auth, createdAt) + index
  - v10: Création tables `archive_jobs` (mangaSlug PK, status, progress counters, timestamps) et `archive_images` (originalUrl PK, mangaSlug, chapterSlug, pageIndex, extension) + index
  - v11: Seed `archive_jobs` avec les mangas déjà en bibliothèque utilisateur mais sans job d'archivage (INSERT...SELECT DISTINCT from user_library WHERE NOT EXISTS in archive_jobs)

### cache.ts - Opérations de cache
Fonctions principales :
- `getCachedMangas(source, language)` / `upsertMangas(list)` - Cache manga
- `searchMangas(query, language?)` - Recherche ILIKE case-insensitive
- `getCachedChapters(mangaSlug)` / `upsertChapters(mangaSlug, list)` - Cache chapitres
- `getCachedChapterDetail(mangaSlug, chapterSlug)` / `upsertChapterDetail(...)` - Cache images
- `getCachedLatest(source, language)` / `upsertLatest(list)` - Cache latest updates
- `getCachedMangaInfo(mangaSlug)` / `upsertMangaInfo(mangaSlug, info)` - Cache métadonnées manga (genres en JSON string)
- `getScraperStatusFromDb()` - Agrégat statut scraper
- `markSourceStale(sourceId)` - Marquer une source comme stale
- `getChapterCounts(slugs)` - Comptage chapitres en bulk pour dédup (batch 500)

**Batch processing**: Inserts en chunks de 500 avec `onConflictDoUpdate`.

### dedup.ts - Déduplication cross-source
Élimine les doublons quand le même manga apparaît sur plusieurs sources (même titre, même langue).
Fonctions pures sans dépendance DB :
- `normalizeTitle(title)` → lowercase, strip diacritiques/parenthèses/crochets/ponctuation, collapse whitespace
- `deduplicateMangas(items, chapterCounts?)` → groupe par `(normalizedTitle, language)`, garde le meilleur `knownChapterCount`, tiebreak par priorité source
- `deduplicateLatest(items)` → même groupement, garde le plus récent `updatedAt`, tiebreak par priorité source

**Priorité des sources** : mangadex=4, scanvf=3, mangapill=2, mgeko=1, harimanga=0
**Intégré dans** : `/api/manga` (skip si source unique), `/api/manga/search`, `/api/manga/latest`
**N'affecte PAS** : bibliothèque utilisateur, progression, chapitres (opèrent sur les slugs exacts)

## sources/ - Sources Manga

### Interface MangaSource (types.ts)
```typescript
interface MangaSource {
  readonly id: SourceId;      // 'scanvf' | 'mangapill' | 'mangadex' | 'mgeko' | 'harimanga'
  readonly language: Language; // 'fr' | 'en'
  readonly allowedImageHosts: string[];
  fetchMangaList(): Promise<MangaSourceResult[]>;
  fetchLatestUpdates?(page?: number): Promise<MangaSourceResult[]>;
  fetchChapters(mangaSlug: string): Promise<ChapterResult[]>;
  fetchChapter(mangaSlug: string, chapterSlug: string): Promise<ChapterDetailResult>;
  fetchMangaInfo?(mangaSlug: string): Promise<MangaInfo>;
}
```

### Implémentations par source

| Source | URL | Lang | Slug Prefix | Méthode scraping | CDN images | fetchMangaInfo |
|--------|-----|------|-------------|------------------|------------|----------------|
| ScanVF | scan-vf.net | FR | (aucun) | Regex HTML | scan-vf.net | ✓ (synopsis, author, genres, status) |
| MangaPill | mangapill.com | EN | `mp-` | Regex HTML | cdn.readdetectiveconan.com | ✓ (synopsis, genres, status — no author/artist) |
| MangaDex | api.mangadex.org | FR | `md-` | API REST JSON | uploads.mangadex.org, *.mangadex.network | ✓ (all fields) |
| Mgeko | mgeko.cc | EN | `mgk-` | Regex HTML | imgsrv4.com | ✓ (synopsis, author, genres, status) |
| Harimanga | harimanga.me | EN | `hm-` | Regex HTML | *.manimg24.com, harimanga.me | ✓ (synopsis, author, artist, genres, status) |

### Conventions de scraping
- **Pas de dépendances lourdes**: `fetch()` natif + regex (pas de Cheerio/Puppeteer)
- **Pagination**: Chaque source pagine jusqu'à 999 pages max
- **Validation des slugs**: Regex strictes par source avant fetch
- **Gestion d'erreurs**: try-catch + fallback cache + log console
- **MangaDex uniquement**: Retry avec backoff exponentiel (2s, 4s), délai 250ms entre requêtes
- **Harimanga**: Regex flexibles pour gérer les variations d'attributs HTML (data-src vs src)
- **MangaPill**: Double extraction (covers séparés des titres, merge par clé)

### index.ts - Registry
- `resolveSourceFromMangaSlug(slug)` - **CRITIQUE**: Résout la source depuis le préfixe du slug
- `getAllAllowedImageHosts()` - Agrège tous les hosts CDN pour le proxy image
- `getSourcesWithLatestUpdates()` - Filtre les sources avec `fetchLatestUpdates`

### coloredMappings.ts - Mapping versions couleur
- `getColoredCounterpart(mangaSlug)` → slug de la version couleur ou `null`
- Mapping statique: `mp-5016-one-piece` → `mp-3258-one-piece-digital-colored-comics`
- Extensible: ajouter des entrées dans la Map `COLORED_COUNTERPARTS`

### coloredMerge.ts - Merge chapitres couleur / N&B
- `mergeWithColoredChapters(bwChapters, coloredChapters, targetMangaSlug)` → `ChapterResult[]`
- Fonction pure: index couleur par numéro → remplace N&B quand match → garde extras N&B → tri asc
- Réécrit `mangaSlug` des chapitres couleur vers le manga principal (transparent pour le client)
- Utilisé dans `/api/manga/[mangaSlug]/chapters` avec fetch parallèle (Promise.all) + fallback cache couleur

## progress/store.ts - Progression (server-side)
- `readProgress(userId)` → Record<key, ReadingProgress>
- `writeProgress(userId, progress)` → Remplacement atomique (transaction)
- `upsertEntry(userId, key, update)` → Merge single chapter (lastReadAt wins)
- `mergeProgress(existing, incoming)` → Last-write-wins par lastReadAt
- Validation UUID: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`

## user/store.ts - Utilisateur (server-side)
- `readLibrary(userId)` → Liste ordonnée par addedAt DESC
- `writeLibrary(userId, slugs)` → Remplacement atomique avec addedAt incrémenté
- `addToLibrary(userId, mangaSlug)` / `removeFromLibrary(userId, mangaSlug)`
- `removeFromLibrary` cascade : supprime aussi les entrées de progression
- `readSettings(userId)` / `writeSettings(userId, settings)`
- `readFullUserState(userId)` → Agrège progress + library + settings
- Defaults: `{readingMode: 'longstrip', prefetchCount: 3, autoNextChapter: true, language: 'fr'}`

## push/index.ts - Push Notifications
- `saveSubscription(userId, sub)` — Upsert abonnement push (onConflictDoUpdate)
- `removeSubscription(userId, endpoint)` — Supprime un abonnement push
- `notifyNewChapters(mangaSlug, title, label)` — Envoie des push à tous les followers d'un manga. Auto-supprime les subs 410/404 (Gone/Not Found). Loggue les erreurs non-cleanup.
- **Dépendance**: `web-push` package, gated par `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` env vars
- **Appelé par**: scheduler.ts (fire-and-forget après détection nouveaux chapitres)

## stats.ts - Statistiques de lecture
- `computeStats(progress)` → `ReadingStats` — Fonctions pures, pas de dépendance DB/store
- Retourne: chaptersThisWeek, chaptersToday, totalChaptersRead, totalMangaStarted, completionRate, currentStreak, longestStreak, dailyActivity (30 jours), mangaBreakdown
- Helpers exportés: `getDayStart(now)`, `getWeekStart(now)` (epoch ms)
- Helpers internes: `computeDailyActivity(entries, now)`, `computeStreaks(entries, now)`

## archive/ - Auto-archivage serveur

### index.ts - API publique
- `enqueueArchive(mangaSlug)` — Crée un job d'archivage si non existant/complété, réveille le worker
- `getArchiveStatus(mangaSlug)` → `ArchiveStatus | null` — Statut d'archivage pour un manga
- `lookupLocalImage(originalUrl)` → `string | null` — Cherche le chemin local d'une image (cache in-memory + DB)
- `enqueueNewChapters(mangaSlug)` — Re-queue un manga archivé quand de nouveaux chapitres sont détectés
- `startArchiveWorker()` — Démarre le worker (singleton, appelé depuis instrumentation.ts)
- `invalidatePathCache(url)` — Invalide une entrée du cache path (appelé par le worker après download)

### worker.ts - Worker de téléchargement
- Module-level singleton (`_started`, `isProcessing`)
- FIFO queue: pick oldest `pending` job, archive tous les chapitres séquentiellement
- Par chapitre: fetch detail (source → fallback cache) → download images (3 en parallèle via Promise pool)
- Retry 3x par image avec 1s delay, skip après échec final
- Referer spoofing per CDN host, User-Agent Chrome
- Délai par source (200-300ms) entre requêtes
- Poll interval: 60s, réveillable via `wakeWorker()`
- Statuts: pending → downloading → completed | partial | failed

### storage.ts - Opérations filesystem
- `ARCHIVE_BASE_PATH` = `process.env.ARCHIVE_PATH || '/data/manga'`
- `getImagePath(mangaSlug, chapterSlug, pageIndex, ext)` → chemin absolu validé (protection path traversal)
- `saveImage()`, `readImage()`, `imageExists()`, `ensureDir()`
- Validation: composants de chemin ne contiennent pas `../`, `/`, `\`, extensions dans whitelist image

### pathCache.ts - Cache in-memory URL→path
- LRU FIFO, 10 000 entrées max
- Stocke `null` pour les résultats négatifs (URL non archivée)
- `pathCacheGet(key)`, `pathCacheSet(key, value)`, `pathCacheInvalidate(key)`

## scraper/scheduler.ts
- Intervalle: 55 minutes entre scrapes complets
- Délai initial: 5 secondes après démarrage serveur
- Flag `isRunning` pour empêcher les scrapes concurrents
- Marque les sources en échec comme `stale` (données préservées)
- `startScheduler()`, `getScraperStatus()`, `triggerManualScrape()`

## format.ts - Utilitaires de formatage
- `formatMangaSlug(slug)` → Supprime préfixe, title-case (MangaDex → "MangaDex manga")
- `formatChapterSlug(slug)` → Extraction numéro, localisation (Chapitre/Chapter)
- `formatRelativeDate(epoch)` → Dates relatives en français (il y a X min/h/j/sem/mois)
