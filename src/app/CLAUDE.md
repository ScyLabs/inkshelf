# src/app/ - Pages & API Routes (Next.js App Router)

## Structure
```
app/
├── layout.tsx                              # Root layout (AppShell, meta PWA)
├── page.tsx                                # Home → LibraryPage (Suspense)
├── globals.css                             # Styles globaux Tailwind
├── manga/
│   └── [mangaSlug]/
│       └── page.tsx                        # → CataloguePage
├── read/
│   ├── [mangaSlug]/
│   │   └── page.tsx                        # Legacy redirect (défaut: one_piece)
│   └── [mangaSlug]/[chapterSlug]/
│       └── page.tsx                        # → ReaderPage
├── settings/
│   └── page.tsx                            # → SettingsPage
└── api/                                    # API Routes (voir ci-dessous)
```

## Pages

### layout.tsx - Root Layout
- Wraps tout dans `<AppShell>` (composant client)
- Metadata PWA: manifest, apple-web-app-capable, viewport cover
- Import globals.css

### page.tsx - Home
- `<Suspense>` wrapper autour de `<LibraryPage />`

### manga/[mangaSlug]/page.tsx
- Re-export simple de `<CataloguePage />`

### read/[mangaSlug]/page.tsx (Legacy)
- Redirect vers `/read/{mangaSlug}/{chapterSlug}` avec one_piece comme défaut

### read/[mangaSlug]/[chapterSlug]/page.tsx
- Re-export simple de `<ReaderPage />`

## API Routes

### Manga

| Route | Méthode | Purpose | Cache |
|-------|---------|---------|-------|
| `/api/manga` | GET | Liste manga (filtre: source, lang) | s-maxage=3600 |
| `/api/manga/search` | GET | Recherche (q, lang, max 200 chars) | s-maxage=60 |
| `/api/manga/latest` | GET | Dernières MàJ (lang, type: updates/new) | s-maxage=900 |
| `/api/manga/[mangaSlug]/chapters` | GET | Chapitres d'un manga | s-maxage=3600 |
| `/api/manga/[mangaSlug]/chapter/[chapterSlug]` | GET | Détail chapitre + images | s-maxage=86400 |
| `/api/manga/[mangaSlug]/info` | GET | Métadonnées manga (synopsis, auteur, genres, statut). MangaDex-only, fallback cache | s-maxage=86400 |

### User & Progress

| Route | Méthode | Purpose |
|-------|---------|---------|
| `/api/progress/[userId]` | GET | Toute la progression d'un user |
| `/api/progress/[userId]` | PUT | Sync bulk (replace all) |
| `/api/progress/[userId]/[mangaSlug]/[chapterSlug]` | PATCH | Update single chapter |
| `/api/progress/[userId]/batch` | POST | Batch mark chapters as read (mangaSlug + chapterSlugs[], max 2000) |
| `/api/user/[userId]` | GET | État complet (progress + library + settings) |
| `/api/user/[userId]/library` | PUT | Replace bibliothèque |
| `/api/user/[userId]/library` | PATCH | Add/remove manga (action: add/remove) |
| `/api/user/[userId]/settings` | PUT | Update settings |
| `/api/user/[userId]/sync-check` | GET | Lightweight sync check — returns `{ lastUseAt }` from userMeta (single PK lookup, ~50 bytes). Used by polling to detect cross-device changes without fetching full state. No cache. |

### Push Notifications

| Route | Méthode | Purpose | Cache |
|-------|---------|---------|-------|
| `/api/push/vapid-key` | GET | Clé publique VAPID (503 si non configurée) | s-maxage=86400 |
| `/api/push/subscribe` | POST | Enregistrer abonnement push (userId + subscription) | - |
| `/api/push/unsubscribe` | POST | Supprimer abonnement push (userId + endpoint) | - |

### Autres

| Route | Méthode | Purpose | Cache |
|-------|---------|---------|-------|
| `/api/img/[encoded]` | GET | Proxy images opaque (base64url, host whitelist, in-memory cache 1h) | max-age=86400 |
| `/api/archive/[mangaSlug]` | GET | Statut d'archivage d'un manga (pending/downloading/%/completed/partial/failed) | no-cache |
| `/api/scraper` | GET | Statut scraper (read-only) | - |

## Patterns API

### Validation
- UUID: regex stricte pour userId
- Slugs: validation format par source
- Body: vérification des champs requis et enums
- Erreurs: 400 (validation), 502 (upstream), 500 (serveur)

### Caching HTTP
```
Cache-Control: public, s-maxage={TTL}, stale-while-revalidate={SWR}
```
- Manga list: 1h / 24h SWR
- Search: 60s / 5min SWR
- Latest: 15min / 1h SWR
- Chapters: 1h / 24h SWR
- Chapter detail: 24h / 7j SWR
- Image proxy: 24h

### Fallback pattern
Toutes les routes manga tentent un scrape frais et fallback vers le cache DB en cas d'échec. Ce pattern est systématique et critique pour la résilience.

### Image Proxy (/api/img/[encoded])
- URLs opaques: base64url encoding, aucun domaine externe visible dans le HTML ou le réseau
- Whitelist hosts: agrégée depuis toutes les sources via `getAllAllowedImageHosts()`
- Support wildcard: `*.domain.com`
- Referer spoofing: mapping per-host pour éviter le blocage
- Validation: HTTPS/HTTP uniquement, content-type image/* requis
- Cache mémoire serveur: 1h TTL, 200 entrées max, lazy sweep + éviction FIFO
- Header `X-Cache: LOCAL/HIT/MISS` pour observabilité (LOCAL = servi depuis l'archive filesystem)
- **Local-first serving**: vérifie le filesystem local (`lookupLocalImage`) avant de fetch upstream. Les mangas archivés sont servis sans accès aux sources externes
