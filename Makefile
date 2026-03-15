REGISTRY ?= localhost:5000
IMAGE     := $(REGISTRY)/onepiece
SCRAPER   := $(REGISTRY)/onepiece-scraper
TAG       ?= latest
DOMAIN    ?= piece.p1x3lz.io
NAMESPACE ?= manga

.PHONY: dev build push deploy logs restart clean build-scraper push-scraper deploy-scraper deploy-db deploy-all

## --- Local ---

dev: ## Start local dev server
	npm run dev -- -p 3001

## --- Docker (frontend) ---

build: ## Build frontend Docker image
	docker build -t $(IMAGE):$(TAG) .

push: build ## Build and push frontend to registry
	docker push $(IMAGE):$(TAG)

run: build ## Run frontend locally with Docker
	docker run --rm -p 3000:3000 $(IMAGE):$(TAG)

## --- Docker (scraper) ---

build-scraper: ## Build scraper Docker image
	docker build -f scraper/Dockerfile -t $(SCRAPER):$(TAG) .

push-scraper: build-scraper ## Build and push scraper to registry
	docker push $(SCRAPER):$(TAG)

## --- Kubernetes ---

deploy-db: ## Deploy PostgreSQL to K8s
	kubectl apply -n $(NAMESPACE) -f k8s/postgres.yaml

deploy: push ## Build, push, and deploy frontend to K8s
	@sed 's|image: onepiece:latest|image: $(IMAGE):$(TAG)|; s|Host(`onepiece.example.com`)|Host(`$(DOMAIN)`)|' k8s/deployment.yaml | kubectl apply -n $(NAMESPACE) -f -

deploy-scraper: push-scraper ## Build, push, and deploy scraper CronJob to K8s
	@sed 's|image: onepiece-scraper:latest|image: $(SCRAPER):$(TAG)|' k8s/scraper-cronjob.yaml | kubectl apply -n $(NAMESPACE) -f -

deploy-all: deploy-db deploy deploy-scraper ## Deploy DB, frontend, and scraper

rollout: ## Restart deployment (pull latest image)
	kubectl rollout restart deployment/onepiece -n $(NAMESPACE)

logs: ## Tail frontend pod logs
	kubectl logs -f -l app=onepiece -n $(NAMESPACE)

logs-scraper: ## Tail latest scraper job logs
	kubectl logs -f -l app=onepiece-scraper -n $(NAMESPACE)

status: ## Show pod status
	kubectl get pods -l app=onepiece -n $(NAMESPACE)

## --- Cleanup ---

clean: ## Remove Docker images
	docker rmi $(IMAGE):$(TAG) 2>/dev/null || true
	docker rmi $(SCRAPER):$(TAG) 2>/dev/null || true

## --- Help ---

help: ## Show this help
	@grep -E '^[a-z][-a-z]*:.*## ' Makefile | awk -F ':.*## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
