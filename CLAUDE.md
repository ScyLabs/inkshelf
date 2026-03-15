# OnePiece Reader - Manga Reading PWA

## Project Overview
Application de lecture manga multi-source avec bibliothèque utilisateur, suivi de progression, et synchronisation cross-device. Déployée en tant que PWA sur Kubernetes avec PostgreSQL.

## Tech Stack
- **Framework**: Next.js 15.3.3 (App Router) + React 19
- **Langage**: TypeScript 5.9 (strict mode)
- **Base de données**: PostgreSQL + Drizzle ORM 0.45.1
- **State Management**: Zustand 5.0.11 (avec persist middleware)
- **Styling**: TailwindCSS 4 (utility-first, pas de CSS modules)
- **PWA**: Serwist 9.0.18 (Service Worker)
- **Tests**: Vitest 4.0.18 + Testing Library
- **Déploiement**: Docker + Kubernetes (namespace: manga)
- **Registry**: Docker registry configurable (défaut: localhost:5000)

## Architecture Générale
```
src/
├── app/            # Pages Next.js (App Router) + API routes
├── components/     # Composants React (par feature: library, catalogue, reader, settings)
├── hooks/          # Custom hooks (useChapter, useReadingProgress, usePrefetch)
├── stores/         # Zustand stores (user, library, catalogue, progress, settings)
├── lib/            # Backend: sources, db, progress, user, scraper, format
├── services/       # Client HTTP (api.ts) et image proxy
├── types.ts        # Types globaux partagés
├── sw.ts           # Service Worker config
└── instrumentation.ts  # Hook d'init Next.js (initDb)
scraper/            # Script CLI standalone de scraping
k8s/                # Manifestes Kubernetes
data/               # Données locales dev (SQLite legacy)
```

## Conventions Critiques

### Path Alias
- Toujours utiliser `@/` pour les imports (→ `./src/*`)

### Slug System (CRITIQUE)
Chaque source a un préfixe unique dans les slugs manga :
- `mp-{id}-{slug}` → MangaPill
- `md-{uuid}` → MangaDex
- `mgk-{slug}` → Mgeko
- `hm-{slug}` → Harimanga
- Pas de préfixe → ScanVF
La résolution de source se fait via `resolveSourceFromMangaSlug()` dans `lib/sources/index.ts`

### API Routes Pattern
- Toutes sous `/api/` avec handlers GET/PUT/PATCH
- Cache HTTP via `Cache-Control` headers (s-maxage + stale-while-revalidate)
- Fallback systématique vers données en cache si le scraping échoue
- Validation des UUID et slugs par regex avant traitement
- Codes erreur: 400 (validation), 502 (upstream fail), 500 (serveur)

### State Management Pattern
- Zustand stores avec `persist` middleware pour localStorage
- Debounce sur les sync serveur (2000-5000ms)
- Last-write-wins pour les merges local/serveur (via `lastReadAt`)
- `keepalive: true` sur les fetch de flush avant page unload
- Variables module-level pour timers de debounce (pas dans le state Zustand)

### Scraping Pattern
- Aucune dépendance lourde (pas de Cheerio/Puppeteer/Axios)
- Parsing HTML via regex natifs + `fetch()` natif Next.js
- Chaque source implémente l'interface `MangaSource` (lib/sources/types.ts)
- Batch insert en chunks de 500 éléments
- Statut `active`/`stale` pour invalidation du cache

### Base de données
- 8 tables PostgreSQL (voir lib/db/schema.ts)
- Timestamps en epoch seconds (BIGINT)
- Clés composites (ex: userId + mangaSlug + chapterSlug)
- Migrations versionnées (table `schema_version`, actuellement v5)
- Pool de 10 connexions max

### Styling
- Tailwind CSS exclusivement (pas de styled-components ni CSS modules)
- Thème sombre: backgrounds noirs/zinc, accent orange-500
- Mobile-first avec safe-area insets pour les notches
- Grille responsive (2 colonnes pour les cartes manga)

### Tests
- Vitest avec Testing Library (JSDOM)
- Tests colocalisés dans des dossiers `__tests__/`
- Fichiers existants: format.test.ts, api.test.ts, imageProxy.test.ts

## Commandes
```bash
npm run dev          # Dev server
npm run build        # Production build
npm run test         # Vitest
make dev             # Dev sur port 3001
make deploy-all      # Déployer tout le stack K8s
make build && make push  # Build + push Docker frontend
make build-scraper && make push-scraper  # Build + push scraper
```

## Variables d'environnement
- `DATABASE_URL`: URL PostgreSQL (défaut: postgres://onepiece:onepiece@localhost:5432/onepiece)
- `REGISTRY`: Docker registry
- `DOMAIN`: Domaine Traefik (défaut: piece.p1x3lz.io)
- `NAMESPACE`: K8s namespace (défaut: manga)
