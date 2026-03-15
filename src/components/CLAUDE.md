# src/components/ - Composants React

Composants organisés par feature (library, catalogue, reader, settings) + layout global.

## Structure
```
components/
├── layout/
│   └── AppShell.tsx        # Shell applicatif (nav bottom + sync lifecycle)
├── library/
│   ├── LibraryPage.tsx     # Page bibliothèque avec 4 onglets
│   ├── MangaCard.tsx       # Carte manga individuelle
│   └── AlphaNav.tsx        # Navigation alphabétique sidebar
├── catalogue/
│   ├── CataloguePage.tsx   # Liste des chapitres d'un manga
│   ├── MangaInfoSection.tsx # Métadonnées manga (synopsis, auteur, genres)
│   ├── ChapterCard.tsx     # Entrée chapitre individuelle
│   └── VolumeAccordion.tsx # Groupe de chapitres par volume
├── reader/
│   ├── ReaderPage.tsx      # Page lecteur (orchestrateur)
│   ├── LongStripViewer.tsx # Lecteur vertical scrollable
│   ├── PagedViewer.tsx     # Lecteur paginé avec swipe + tap zones
│   ├── ReaderImage.tsx     # Image manga avec lazy load + retry
│   ├── ReaderOverlay.tsx   # Overlay de navigation (header/footer)
│   └── ChapterTransition.tsx # Écran fin de chapitre
└── settings/
    ├── SettingsPage.tsx    # Page paramètres
    ├── UserIdPanel.tsx     # Gestion UUID utilisateur
    └── SyncPanel.tsx       # Contrôles de synchronisation
```

## layout/AppShell.tsx
**Rôle**: Wrapper racine de l'app, gère le lifecycle global.
- **Navigation bottom**: 3 icônes (Library, Reading, Settings) avec état actif
- **Hydration**: Spinner pendant le chargement initial des stores
- **Migration legacy**: Migre les données localStorage vers le serveur
- **Sync lifecycle**: Syncs automatiques sur visibilitychange (hidden → push, visible → pull)
- **Stores utilisés**: useProgressStore, useUserStore, useLibraryStore, useSettingsStore

## library/ - Bibliothèque

### LibraryPage.tsx
**Rôle**: Vue principale avec 4 onglets de navigation.
- **Onglets**: My Library, All, Latest Updates, Latest New
- **Recherche**: Serveur pour catalogue (doSearch), local pour user tabs (filtre titre côté client)
- **Tri avancé** (user tabs uniquement): Pill row avec 4 modes — Nouveaux (défaut), Dernier lu, Ajout récent, A-Z
  - `added-recent`: utilise l'index dans `followedSlugs` comme proxy addedAt (array ordonné par addedAt DESC côté serveur)
  - `last-read`: utilise `lastReadMap` (max lastReadAt par manga depuis progressStore)
- **Infinite scroll**: IntersectionObserver avec sentinel, 20 items/page
- **Groupement alphabétique**: Lettres sticky + sidebar AlphaNav
- **Badge NEW**: Détection chapitres non lus via seenChapterCounts
- **Suppression**: Bouton remove avec confirmation (double-tap)
- **Continue Reading**: Accès rapide au dernier chapitre lu
- **Header sticky**: Collapsible avec search/tabs/language selector + sort selector
- **Persistance tab**: Via URL searchParams

### MangaCard.tsx
**Props**: `manga: MangaListItem, hasNew?, showRemove?, showChapterInfo?`
- Cover avec placeholder fallback, aspect-ratio 3:4
- Barre de progression (chapitres lus / total)
- Badge NEW, info dernier chapitre + date relative
- Suppression avec confirmation (2 taps)
- Navigation vers `/manga/[mangaSlug]`

### AlphaNav.tsx
**Props**: `availableLetters: Set<string>, activeLetter: string | null, onLetterClick`
- Sidebar fixe droite, lettres A-Z + #
- Lettres indisponibles désactivées, active surlignée

## catalogue/ - Catalogue Manga

### CataloguePage.tsx
**Rôle**: Liste des chapitres d'un manga (slug depuis route params).
- **Filtres**: chapter / volume / all
- **Masquer les lus**: Toggle hideRead (défaut: activé) — masque chapitres avec `progress[key].completed`. Icône œil, état actif orange
- **Tri**: Toggle sortOrder asc/desc — appliqué aux chapitres ET aux groupes de volumes. Icône chevron
- **Vues**: Flat list ou groupé par volumes (10 chapitres/volume)
- **Recherche**: Filtrage local
- **Continue Reading**: Bouton d'accès rapide
- **Progress**: Checkmarks + barres de progression par chapitre
- **Batch mode**: Toggle "Marquer lu jusqu'à…" — tap un chapitre pour marquer tous les chapitres jusqu'à celui-ci comme lus (via `markBatchCompleted`). Direction-aware: en mode desc, marque `>= target`, en mode asc, marque `<= target`
- **Bulk download**: Bouton "Tout télécharger (X chapitres)" — télécharge tous les chapitres non téléchargés via `startBulkDownload()`. Barre de progression orange avec compteur (X/Y chapitres + %). Bouton annulation (X). Masqué quand tout est téléchargé. Utilise `useDownloadStore` (bulkDownload, undownloadedCount).
- **Manga info**: Affiche MangaInfoSection entre le header et la liste des chapitres (fetch via fetchMangaInfo)

### MangaInfoSection.tsx
**Props**: `mangaSlug: string`
- Fetch métadonnées manga via `/api/manga/{slug}/info` (MangaDex-only, graceful null pour autres sources)
- Badge statut coloré (ongoing=vert, completed=bleu, hiatus=jaune, cancelled=rouge)
- Auteur/artiste, synopsis tronqué (3 lignes + "Show more"), pills de genres
- Retourne null si aucune donnée disponible

### ChapterCard.tsx
**Props**: `entry: CatalogueEntry, mangaSlug, progress?, batchMode?, onBatchMark?`
- Numéro/label, checkmark vert si complété
- Barre de progression si partiellement lu
- CSS containment pour performance
- **Batch mode**: Bordure orange gauche + texte "Marquer jusqu'ici" quand `batchMode=true`
- **Download offline**: Bouton téléchargement (icône flèche), progression %, checkmark vert quand terminé, X rouge en erreur. Utilise `downloadChapter()` du service offlineDownload

### VolumeAccordion.tsx
**Props**: `group: VolumeGroup, mangaSlug, progress, batchMode?, onBatchMark?`
- Collapsible avec chevron animé
- Rendu des ChapterCard enfants (pass-through batch props)

## reader/ - Lecteur Manga

### ReaderPage.tsx
**Rôle**: Orchestrateur du lecteur (slug depuis route params).
- Loading spinner + error state
- Overlay toggle au tap centre (auto-hide 3s)
- Prefetch du prochain chapitre via usePrefetch
- **Mode conditionnel**: Rend `PagedViewer` ou `LongStripViewer` selon `readingMode` du settingsStore
- `key={chapterSlug}` sur PagedViewer pour reset du state entre chapitres

### PagedViewer.tsx
**Props**: `slug, images[], nextSlug, onPageChange, mangaSlug`
- Affiche une seule image à la fois avec navigation
- **Swipe**: Touch detection inline (deltaX>50px, <500ms, horizontal>vertical)
- **Tap zones**: Gauche 30%=prev, droite 30%=next, centre bubble vers parent (overlay toggle)
- **Clavier**: ArrowRight/Down=next, ArrowLeft/Up=prev
- **Preload**: Adjacent images via `Image()` objects dans un useEffect
- **Progress**: useReadingProgress pour sauvegardes debounced via useEffect
- **ChapterTransition**: Affiché quand `currentPage >= images.length`

### LongStripViewer.tsx (COMPOSANT CLÉ)
**Props**: `slug, images[], nextSlug, onPageChange, mangaSlug`
- **IntersectionObserver**: Track de la page visible
- **Scroll restoration**: Restaure la position depuis la progression sauvegardée
- **LOAD_BUFFER = 3**: Seules les images à ±3 pages du viewport sont rendues
- **Debounce save**: useReadingProgress avec debounce 2s
- **ChapterTransition**: Affiché en fin de scroll

### ReaderImage.tsx
**Props**: `originalUrl, index, visible?`
- Lazy loading conditionnel (visible prop)
- Retry automatique (3 tentatives, 1s entre chaque)
- Bouton retry manuel après 3 échecs
- Fade-in transition, skeleton placeholder
- Image proxy via `buildProxyImageUrl()`
- forwardRef pour le tracking IntersectionObserver parent

### ReaderOverlay.tsx
**Props**: `visible, title, currentPage, totalPages, prevSlug, nextSlug, mangaSlug`
- Top bar: bouton retour + titre chapitre
- Bottom bar: prev/next + compteur de pages
- Slide transitions, background blur, safe-area insets

### ChapterTransition.tsx
**Props**: `currentSlug, nextSlug, nextTitle?, mangaSlug`
- IntersectionObserver: marque comme complété quand 50% visible
- Bouton navigation vers le prochain chapitre
- Flag `marked` pour ne déclencher qu'une fois

## settings/ - Paramètres

### SettingsPage.tsx
- Language selector (FR/EN), Reading mode (Long Strip / Paged)
- Toggles: prefetch, auto-next chapter
- Composants: Toggle custom, StatsPanel, NotificationsPanel, UserIdPanel, SyncPanel

### StatsPanel.tsx
- Statistiques de lecture depuis useProgressStore via `computeStats()`
- Grille 3x2: This Week / Today / Total Read / Manga / Completion % / Streak
- Heatmap activité 30 jours (barres CSS proportionnelles, orange-500 sur zinc-700)
- Pas de dépendance backend — calcul purement côté client

### NotificationsPanel.tsx
- Toggle push notifications (PushManager API + VAPID key)
- États: loading, unsupported (return null), denied, enabled, disabled
- Lazy useState initializer pour état initial (pas de useEffect)
- localStorage flag `push-notifications-enabled` pour persistance
- On enable: requestPermission → fetchVapidKey → pushManager.subscribe → subscribePush API
- On disable: unsubscribe → unsubscribePush API
- Affiche "Blocked by browser" si permission denied
- Helper interne: `urlBase64ToUint8Array` pour VAPID key

### UserIdPanel.tsx
- Affichage, copie, collage, régénération du UUID
- Validation format UUID strict
- Affiche lastActive du userId actuel

### SyncPanel.tsx
- Compteur chapitres suivis, dernier sync
- Bouton sync avec états (Sync Now / Syncing / Synced / Failed)
- Couleurs dynamiques selon statut (orange/vert/rouge)

## Patterns UI Communs
- **IntersectionObserver**: Infinite scroll, page tracking, completion detection
- **Debounce**: Recherche (300ms), save progression (2000ms), sync settings (2000ms)
- **Auto-dismiss**: Overlays avec timeout 3s
- **Confirmation double-tap**: Suppression de mangas
- **Skeleton/Placeholder**: Images en chargement avec spinner
- **Safe-area insets**: Support notches mobile (env(safe-area-inset-*))
- **Styling**: Tailwind exclusivement, thème sombre, accent orange-500
