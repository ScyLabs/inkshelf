# scraper/ - Script CLI de Scraping

Script standalone Node.js pour le scraping bulk des sources manga, exécuté en tant que CronJob Kubernetes.

## Structure
```
scraper/
├── run.ts       # Script principal d'exécution
└── Dockerfile   # Image Docker (Node 22 Alpine + tsx)
```

## run.ts
**Purpose**: Scrape toutes les sources séquentiellement et mets à jour le cache DB.

**Flux**:
1. `initDb()` - Initialise la connexion PostgreSQL
2. Pour chaque source (`getAllSources()`):
   a. `source.fetchMangaList()` - Scrape la liste complète
   b. `upsertMangas(results)` - Insert/update en batch (500/chunk)
   c. En cas d'erreur: `markSourceStale(source.id)` + log + continue
3. Exit code 0 (succès) ou 1 (erreur fatale)

**Exécution**: `tsx scraper/run.ts`

## Dockerfile
```dockerfile
FROM node:22-alpine
# Copie uniquement src/lib/ et scraper/ (pas les composants frontend)
# Exécute tsx scraper/run.ts
```

## Déploiement K8s
**Fichier**: `k8s/scraper-cronjob.yaml`
- CronJob Kubernetes pour exécution périodique
- Utilise la même image que le scraper Docker
- Se connecte au même PostgreSQL que le frontend

## Commandes Make
```bash
make build-scraper   # Build l'image Docker du scraper
make push-scraper    # Push vers le registry
make deploy-scraper  # Déploie le CronJob K8s
make logs-scraper    # Tail les logs du scraper
```

## Notes
- Le scraper est séparé du scheduler (`lib/scraper/scheduler.ts`) qui tourne dans le process Next.js
- Le scraper CLI est pour les exécutions ponctuelles/CronJob, le scheduler pour le maintien du cache en temps réel
- Les deux utilisent les mêmes sources et la même couche DB
