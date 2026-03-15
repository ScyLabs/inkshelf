# src/services/ - Services Client-Side

Couche HTTP côté client et utilitaires de services.

## Structure
```
services/
├── api.ts              # Client HTTP pour toutes les API routes
├── imageProxy.ts       # Constructeur d'URLs proxy pour images
├── offlineDownload.ts  # Téléchargement hors-ligne via SW cache + cache explicite
└── __tests__/
    ├── api.test.ts
    ├── imageProxy.test.ts
    └── offlineDownload.test.ts
```

## api.ts - Client HTTP
Service centralisé pour tous les appels API. Utilise `fetch()` natif.

### Endpoints Manga
- `fetchMangaList(lang?)` → GET `/api/manga?lang={lang}`
- `fetchLatestMangas(lang, type)` → GET `/api/manga/latest?lang={lang}&type={type}`
- `searchMangas(query, lang?)` → GET `/api/manga/search?q={query}&lang={lang}`
- `fetchMangaChapters(mangaSlug)` → GET `/api/manga/{slug}/chapters`
- `fetchMangaChapter(mangaSlug, chapterSlug)` → GET `/api/manga/{slug}/chapter/{ch}`
- `fetchMangaInfo(mangaSlug)` → GET `/api/manga/{slug}/info` — retourne `MangaInfo | null`, pas de throw en erreur

### Endpoints Sync
- `syncProgressToServer(userId, progress)` → PUT `/api/progress/{userId}`
- `fetchProgressFromServer(userId)` → GET `/api/progress/{userId}`
- `pushSingleProgress(userId, mangaSlug, chapterSlug, update)` → PATCH `/api/progress/{userId}/{manga}/{ch}`

### Endpoints User
- `fetchUserState(userId)` → GET `/api/user/{userId}` (progress, library, settings)
- `fetchSyncCheck(userId)` → GET `/api/user/{userId}/sync-check` — retourne `lastUseAt: number | null`. Lightweight (~50 bytes). Retourne null on error (pas de throw). Utilisé par le polling cross-device.
- `pushLibraryAction(userId, action, mangaSlug)` → PATCH `/api/user/{userId}/library`
- `pushSettings(userId, settings)` → PUT `/api/user/{userId}/settings`

### Endpoints Push Notifications
- `fetchVapidKey()` → GET `/api/push/vapid-key` — retourne clé publique VAPID (string vide si 503)
- `subscribePush(userId, subscription)` → POST `/api/push/subscribe`
- `unsubscribePush(userId, endpoint)` → POST `/api/push/unsubscribe`

### Fonctions dépréciées
- `fetchCatalogue()` → Redirige vers `fetchMangaChapters('one_piece')`
- `fetchChapter(slug)` → Redirige vers `fetchMangaChapter('one_piece', slug)`

## offlineDownload.ts
- `downloadChapter(mangaSlug, chapterSlug, onProgress, signal?)` — Fetch toutes les images d'un chapitre via proxy, le SW CacheFirst les met automatiquement en cache. Concurrence de 3 workers. Callback `onProgress` pour suivi (total, done, error). AbortSignal optionnel pour annulation. **Throw si des images échouent.**
- `downloadManga(mangaSlug, chapterSlugs, onProgress, signal?)` — Télécharge séquentiellement N chapitres via `downloadChapter()`. Callback `BulkDownloadProgress` (totalChapters, completedChapters, currentChapter, currentImages). Continue après les échecs individuels. Retourne `{ downloaded, failed }`. AbortSignal vérifié entre chaque chapitre.
- `cacheChapterData(mangaSlug, chapterSlug, data)` — (privé) Cache explicitement les métadonnées chapitre dans le cache `offline-chapters` via Cache Storage API. Appelé automatiquement par `downloadChapter()`. Ce cache dédié n'a pas d'ExpirationPlugin contrairement au cache SW `manga-list`.
- `getOfflineCachedChapter(mangaSlug, chapterSlug)` — Lit les métadonnées chapitre depuis le cache `offline-chapters`. Retourne `ChapterData | null`. Utilisé par `useChapter` comme fallback quand le fetch réseau échoue en mode hors ligne.
- Consomme le body response (`resp.blob()`) pour garantir la mise en cache complète
- **Cache dédié `offline-chapters`**: séparé du cache SW `manga-list` pour éviter l'éviction par ExpirationPlugin

## imageProxy.ts
- `encodeBase64Url(url)` — Encode une URL en base64url (RFC 4648 §5, sans padding)
- `decodeBase64Url(encoded)` — Decode un segment base64url vers l'URL originale
- `buildProxyImageUrl(originalUrl)` → `/api/img/{base64url(url)}` — URL opaque, aucun domaine externe visible
- Utilisé par ReaderImage, MangaCard, PagedViewer, usePrefetch, offlineDownload

## Tests
- `api.test.ts` - Tests du service API
- `imageProxy.test.ts` - Tests encode/decode base64url + format URL proxy (7 tests)
- `offlineDownload.test.ts` - Tests téléchargement offline avec URLs proxy (21 tests — dont 7 pour downloadManga bulk)
